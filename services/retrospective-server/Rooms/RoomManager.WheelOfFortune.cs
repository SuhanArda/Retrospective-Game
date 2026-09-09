using Retrospective.Server.Contracts;

namespace Retrospective.Server.Rooms;

public sealed partial class RoomManager
{
    private const int WheelSpinDurationMs = 4_000;
    private const int WheelQuestionMaxLength = 300;
    private const int WheelQuestionMaxCount = 50;

    public WheelMutation AddWheelQuestion(string connectionId, WheelQuestionRequest request)
    {
        var (room, _) = Authorize(connectionId, hostRequired: true);
        lock (room.Gate)
        {
            var state = AuthorizeWheel(room, request.GameSessionId, "SETUP");
            if (state.Questions.Count >= WheelQuestionMaxCount) throw new RoomException("TOO_MANY_QUESTIONS");
            state.Questions.Add(new WheelQuestion(Guid.NewGuid().ToString("N"), NormalizeWheelQuestion(request.Text)));
            AdvanceWheelState(state, "SETUP");
            return WheelMutationFor(room);
        }
    }

    public WheelMutation UpdateWheelQuestion(string connectionId, UpdateWheelQuestionRequest request)
    {
        var (room, _) = Authorize(connectionId, hostRequired: true);
        lock (room.Gate)
        {
            var state = AuthorizeWheel(room, request.GameSessionId, "SETUP");
            var question = state.Questions.SingleOrDefault(candidate => candidate.Id == request.QuestionId)
                ?? throw new RoomException("QUESTION_NOT_FOUND");
            question.Text = NormalizeWheelQuestion(request.Text);
            AdvanceWheelState(state, "SETUP");
            return WheelMutationFor(room);
        }
    }

    public WheelMutation RemoveWheelQuestion(string connectionId, string gameSessionId, string questionId)
    {
        var (room, _) = Authorize(connectionId, hostRequired: true);
        lock (room.Gate)
        {
            var state = AuthorizeWheel(room, gameSessionId, "SETUP");
            var removed = state.Questions.RemoveAll(candidate => candidate.Id == questionId);
            if (removed == 0) throw new RoomException("QUESTION_NOT_FOUND");
            state.UsedQuestionIds.Remove(questionId);
            AdvanceWheelState(state, "SETUP");
            return WheelMutationFor(room);
        }
    }

    public WheelMutation StartWheelGame(string connectionId, WheelGameRequest request)
    {
        var (room, _) = Authorize(connectionId, hostRequired: true);
        lock (room.Gate)
        {
            var state = AuthorizeWheel(room, request.GameSessionId, "SETUP");
            if (state.Questions.Count == 0) throw new RoomException("QUESTIONS_REQUIRED");
            AdvanceWheelState(state, "PLAYER_WHEEL_READY");
            return WheelMutationFor(room);
        }
    }

    public WheelMutation SpinWheelPlayer(string connectionId, WheelGameRequest request)
    {
        var (room, _) = Authorize(connectionId, hostRequired: true);
        lock (room.Gate)
        {
            var state = AuthorizeWheel(room, request.GameSessionId, "PLAYER_WHEEL_READY");
            var eligible = room.Players.Values
                .Where(player => player.ConnectionId is not null)
                .OrderBy(player => player.JoinedAt)
                .ToArray();
            if (eligible.Length == 0) throw new RoomException("NO_PLAYERS");
            var selectedIndex = roomRandom.Next(eligible.Length);
            var now = timeProvider.GetUtcNow().ToUnixTimeMilliseconds();
            var selected = eligible[selectedIndex];
            state.SelectedPlayerId = selected.Id;
            state.PlayerSpin = new WheelSpin(Guid.NewGuid().ToString("N"), selected.Id, selectedIndex, now, WheelSpinDurationMs);
            AdvanceWheelState(state, "PLAYER_WHEEL_SPINNING", now);
            return WheelMutationFor(room);
        }
    }

    public WheelMutation SpinWheelQuestion(string connectionId, WheelGameRequest request)
    {
        var (room, _) = Authorize(connectionId, hostRequired: true);
        lock (room.Gate)
        {
            var state = AuthorizeWheel(room, request.GameSessionId);
            AdvanceExpiredWheelSpin(state);
            if (state.Phase != "QUESTION_WHEEL_READY") throw new RoomException("INVALID_WHEEL_PHASE");

            var unused = state.Questions.Where(question => !state.UsedQuestionIds.Contains(question.Id)).ToArray();
            if (unused.Length == 0)
            {
                state.UsedQuestionIds.Clear();
                unused = state.Questions.ToArray();
            }
            var selected = unused[roomRandom.Next(unused.Length)];
            state.UsedQuestionIds.Add(selected.Id);
            var selectedIndex = state.Questions.FindIndex(question => question.Id == selected.Id);
            var now = timeProvider.GetUtcNow().ToUnixTimeMilliseconds();
            state.SelectedQuestionId = selected.Id;
            state.QuestionSpin = new WheelSpin(Guid.NewGuid().ToString("N"), selected.Id, selectedIndex, now, WheelSpinDurationMs);
            AdvanceWheelState(state, "QUESTION_WHEEL_SPINNING", now);
            return WheelMutationFor(room);
        }
    }

    public WheelMutation NextWheelRound(string connectionId, WheelGameRequest request)
    {
        var (room, _) = Authorize(connectionId, hostRequired: true);
        lock (room.Gate)
        {
            var state = AuthorizeWheel(room, request.GameSessionId);
            AdvanceExpiredWheelSpin(state);
            if (state.Phase != "QUESTION_REVEAL") throw new RoomException("INVALID_WHEEL_PHASE");
            state.RoundNumber++;
            state.PlayerSpin = null;
            state.QuestionSpin = null;
            state.SelectedPlayerId = null;
            state.SelectedQuestionId = null;
            AdvanceWheelState(state, "PLAYER_WHEEL_READY");
            return WheelMutationFor(room);
        }
    }

    private bool AdvanceExpiredWheelSpin(GameRoom room)
    {
        var state = room.CurrentGameSession?.WheelOfFortune;
        return state is not null && AdvanceExpiredWheelSpin(state);
    }

    private bool AdvanceExpiredWheelSpin(WheelOfFortuneState state)
    {
        var now = timeProvider.GetUtcNow().ToUnixTimeMilliseconds();
        if (state.Phase == "PLAYER_WHEEL_SPINNING" && state.PlayerSpin is { } playerSpin &&
            playerSpin.StartedAtUnixMs + playerSpin.DurationMs <= now)
        {
            AdvanceWheelState(state, "QUESTION_WHEEL_READY", now);
            return true;
        }
        if (state.Phase == "QUESTION_WHEEL_SPINNING" && state.QuestionSpin is { } questionSpin &&
            questionSpin.StartedAtUnixMs + questionSpin.DurationMs <= now)
        {
            AdvanceWheelState(state, "QUESTION_REVEAL", now);
            return true;
        }
        return false;
    }

    private static WheelOfFortuneState AuthorizeWheel(GameRoom room, string gameSessionId, string? requiredPhase = null)
    {
        if (room.Status != RoomPhase.Playing || room.CurrentGameSession is not { GameId: "wheel-of-fortune" } session ||
            session.Id != gameSessionId || session.WheelOfFortune is null)
            throw new RoomException("WRONG_GAME_SESSION");
        if (requiredPhase is not null && session.WheelOfFortune.Phase != requiredPhase)
            throw new RoomException("INVALID_WHEEL_PHASE");
        return session.WheelOfFortune;
    }

    private static string NormalizeWheelQuestion(string text)
    {
        var normalized = text?.Trim() ?? "";
        if (normalized.Length == 0 || normalized.Length > WheelQuestionMaxLength)
            throw new RoomException("INVALID_QUESTION");
        return normalized;
    }

    private void AdvanceWheelState(WheelOfFortuneState state, string phase, long? now = null)
    {
        state.Phase = phase;
        state.Revision++;
        state.UpdatedAtUnixMs = now ?? timeProvider.GetUtcNow().ToUnixTimeMilliseconds();
    }

    private WheelMutation WheelMutationFor(GameRoom room) => new(room.Code, WheelSnapshot(room.CurrentGameSession!.WheelOfFortune!));

    private WheelOfFortuneStateSnapshot WheelSnapshot(WheelOfFortuneState state) => new(
        state.GameSessionId,
        state.Phase,
        state.Questions.Select(question => new WheelQuestionSnapshot(question.Id, question.Text)).ToArray(),
        state.UsedQuestionIds.ToArray(),
        state.PlayerSpin is null ? null : new WheelSpinSnapshot(state.PlayerSpin.SpinId, state.PlayerSpin.SelectedId,
            state.PlayerSpin.SelectedIndex, state.PlayerSpin.StartedAtUnixMs, state.PlayerSpin.DurationMs),
        state.QuestionSpin is null ? null : new WheelSpinSnapshot(state.QuestionSpin.SpinId, state.QuestionSpin.SelectedId,
            state.QuestionSpin.SelectedIndex, state.QuestionSpin.StartedAtUnixMs, state.QuestionSpin.DurationMs),
        state.SelectedPlayerId,
        state.SelectedQuestionId,
        state.RoundNumber,
        state.Revision,
        state.UpdatedAtUnixMs,
        timeProvider.GetUtcNow().ToUnixTimeMilliseconds());

    private sealed class WheelOfFortuneState(string gameSessionId, long now)
    {
        public string GameSessionId { get; } = gameSessionId;
        public string Phase { get; set; } = "SETUP";
        public List<WheelQuestion> Questions { get; } = [];
        public HashSet<string> UsedQuestionIds { get; } = new(StringComparer.Ordinal);
        public WheelSpin? PlayerSpin { get; set; }
        public WheelSpin? QuestionSpin { get; set; }
        public string? SelectedPlayerId { get; set; }
        public string? SelectedQuestionId { get; set; }
        public int RoundNumber { get; set; } = 1;
        public int Revision { get; set; } = 1;
        public long UpdatedAtUnixMs { get; set; } = now;
    }

    private sealed class WheelQuestion(string id, string text)
    {
        public string Id { get; } = id;
        public string Text { get; set; } = text;
    }

    private sealed record WheelSpin(string SpinId, string SelectedId, int SelectedIndex, long StartedAtUnixMs, int DurationMs);
}

public sealed record WheelMutation(string RoomCode, WheelOfFortuneStateSnapshot Snapshot);
