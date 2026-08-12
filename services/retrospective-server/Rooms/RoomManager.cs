using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;
using Retrospective.Server.Contracts;

namespace Retrospective.Server.Rooms;

public sealed partial class RoomManager(TimeProvider timeProvider, IOptions<RoomOptions> options, IRoomRandom roomRandom)
{
    private const string Alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static readonly HashSet<string> SupportedGames = ["retro-rush", "spin-the-bottle"];
    private static readonly HashSet<int> SupportedVotingDurations = [15, 30, 45, 60];
    private static readonly IReadOnlyDictionary<string, string[]> SpinQuestions = new Dictionary<string, string[]>(StringComparer.Ordinal)
    {
        ["İş"] =
        [
            "Bu sprintte en iyi yaptığımız şey neydi?",
            "Bu sprintte bizi en çok zorlayan konu neydi?",
            "Bir sonraki sprintte neyi farklı yapmalıyız?",
            "Takım içi iletişim ve görev dağılımı nasıldı?",
            "Bu sprintte öğrendiğin en önemli şey neydi?",
        ],
        ["Eğlence"] =
        [
            "Bu sprinti tek kelimeyle anlatacak olsan ne derdin?",
            "Bu sprint bir film veya dizi olsaydı hangisi olurdu?",
            "Bu sprintte yaşadığın en komik veya unutamayacağın an neydi?",
            "Bu sprintte zamanı geri alabilseydin hangi ana geri dönmek isterdin?",
            "Sprint boyunca en çok söylediğin veya düşündüğün cümle neydi?",
        ],
    };
    private readonly ConcurrentDictionary<string, GameRoom> _rooms = new(StringComparer.Ordinal);
    private readonly TimeSpan _disconnectGrace = TimeSpan.FromSeconds(options.Value.DisconnectGraceSeconds);
    private readonly TimeSpan _questionLoadingTime = TimeSpan.FromMilliseconds(options.Value.QuestionLoadingMilliseconds);

    public RoomAdmission Create(CreateRoomRequest request)
    {
        ValidateName(request.DisplayName);
        if (string.IsNullOrWhiteSpace(request.RoomName) || request.RoomName.Trim().Length > 40)
            throw new RoomException("INVALID_ROOM_NAME");
        if (request.MaxParticipants is < 2 or > 50) throw new RoomException("INVALID_CAPACITY");
        if (!SupportedVotingDurations.Contains(request.VotingTimeSeconds))
            throw new RoomException("INVALID_VOTING_DURATION");

        GameRoom room;
        do
        {
            var code = CreateRoomCode();
            room = new GameRoom(Guid.NewGuid().ToString("N"), code, request.RoomName.Trim(), request.MaxParticipants,
                request.QuestionTimeSeconds, request.VotingTimeSeconds, request.FileName, request.Description,
                timeProvider.GetUtcNow().ToUnixTimeMilliseconds());
        } while (!_rooms.TryAdd(room.Code, room));

        lock (room.Gate)
        {
            var admission = AddPlayer(room, request.DisplayName, request.Color);
            room.HostPlayerId = admission.PlayerId;
            return admission with { IsHost = true, Room = Snapshot(room), Player = PlayerSnapshot(room, room.Players[admission.PlayerId]) };
        }
    }

    public RoomAdmission Join(string rawCode, JoinRoomRequest request)
    {
        ValidateName(request.DisplayName);
        var room = Find(rawCode);
        lock (room.Gate)
        {
            if (room.Status == RoomPhase.Playing) throw new RoomException("ROOM_ALREADY_STARTED");
            if (room.Players.Count >= room.MaxParticipants) throw new RoomException("ROOM_FULL");
            return AddPlayer(room, request.DisplayName, request.Color);
        }
    }

    public RoomSnapshot? Get(string rawCode)
    {
        var code = Normalize(rawCode);
        if (!_rooms.TryGetValue(code, out var room)) return null;
        lock (room.Gate) return Snapshot(room);
    }

    public RoomSnapshot Attach(string rawCode, string playerId, string token, string connectionId)
    {
        var room = Find(rawCode);
        lock (room.Gate)
        {
            var player = Authenticate(room, playerId, token);
            player.ConnectionId = connectionId;
            player.DisconnectedAt = null;
            SetRetroRushPlayerConnected(room, player.Id, true);
            return Snapshot(room);
        }
    }

    public AuthenticatedPlayer AuthenticateConnection(string connectionId)
    {
        foreach (var room in _rooms.Values)
        {
            lock (room.Gate)
            {
                var player = room.Players.Values.FirstOrDefault(candidate => candidate.ConnectionId == connectionId);
                if (player is not null) return new AuthenticatedPlayer(room.Code, player.Id, player.DisplayName, player.Color);
            }
        }
        throw new RoomException("NOT_ATTACHED");
    }

    public RoomSnapshot BeginGameSelection(string connectionId, IReadOnlyList<string> candidateGameIds)
    {
        var (room, _) = Authorize(connectionId, hostRequired: true);
        lock (room.Gate)
        {
            if (room.Status == RoomPhase.GameSelection) return Snapshot(room);
            OpenGameSelection(room, candidateGameIds);
            return Snapshot(room);
        }
    }

    public RoomSnapshot CastVote(string connectionId, string gameId)
    {
        var (room, player) = Authorize(connectionId, hostRequired: false);
        lock (room.Gate)
        {
            if (room.Status != RoomPhase.GameSelection) return Snapshot(room);
            if (!room.CandidateGameIds.Contains(gameId, StringComparer.Ordinal)) throw new RoomException("INVALID_GAME");
            room.Votes[player.Id] = gameId;
            return Snapshot(room);
        }
    }

    public VoteResolution ResolveVote(string connectionId)
    {
        var (room, _) = Authorize(connectionId, hostRequired: true);
        lock (room.Gate)
        {
            var gameStarted = ResolveVote(room);
            return new VoteResolution(Snapshot(room), gameStarted);
        }
    }

    public RoomSnapshot ReturnToGameSelection(string connectionId)
    {
        var (room, _) = Authorize(connectionId, hostRequired: true);
        lock (room.Gate)
        {
            OpenGameSelection(room, room.CandidateGameIds);
            return Snapshot(room);
        }
    }

    public RoomSnapshot ReturnToLobby(string connectionId)
    {
        var (room, _) = Authorize(connectionId, hostRequired: true);
        lock (room.Gate)
        {
            room.Status = RoomPhase.Lobby;
            room.SelectedGameId = null;
            room.CurrentGameSession = null;
            room.LastSpinResult = null;
            room.SpinBottleState = null;
            room.Votes.Clear();
            room.VotingStartedAt = null;
            room.VotingEndsAt = null;
            room.TieBreak = null;
            return Snapshot(room);
        }
    }

    public SpinResult Spin(string connectionId)
    {
        var (room, spinner) = Authorize(connectionId, hostRequired: false);
        lock (room.Gate)
        {
            if (room.Status != RoomPhase.Playing || room.CurrentGameSession?.GameId != "spin-the-bottle")
                throw new RoomException("INVALID_ROOM_STATE");
            if (room.SpinBottleState is not null && room.SpinBottleState.Status is not ("IDLE" or "RESOLVED"))
                throw new RoomException("SPIN_ALREADY_ACTIVE");
            var eligible = room.Players.Values.OrderBy(player => player.JoinedAt).Take(6).ToArray();
            if (eligible.Length == 0) throw new RoomException("NO_PLAYERS");
            var targetIndex = roomRandom.Next(eligible.Length);
            var turns = roomRandom.Next(4, 7);
            var previousAngle = room.LastSpinResult?.FinalAngle ?? 0;
            var normalizedAngle = ((previousAngle % 360) + 360) % 360;
            var now = timeProvider.GetUtcNow();
            var spinId = Guid.NewGuid().ToString("N");
            var result = new SpinResult(spinId, room.CurrentGameSession.Id, room.CurrentGameSession.RoundId,
                spinner.Id, eligible[targetIndex].Id, targetIndex,
                previousAngle - normalizedAngle + turns * 360 + targetIndex * 60, 3200, now.ToUnixTimeMilliseconds());
            room.LastSpinResult = result;
            room.SpinBottleState = new SpinBottleState(spinId, spinner.Id, eligible[targetIndex].Id, targetIndex,
                null, null, null, "SPINNING", 1, now.ToUnixTimeMilliseconds(), (now + TimeSpan.FromMilliseconds(result.DurationMs)).ToUnixTimeMilliseconds());
            return result;
        }
    }

    public RoomSnapshot ChooseSpinCategory(string connectionId, string category, int expectedRevision)
    {
        var (room, player) = Authorize(connectionId, hostRequired: false);
        lock (room.Gate)
        {
            var state = AuthorizeSpinAction(room, player, expectedRevision, "CHOICE");
            if (!SpinQuestions.ContainsKey(category)) throw new RoomException("INVALID_QUESTION_CATEGORY");
            state.Category = category;
            AdvanceSpinState(state, "CONFIRM");
            return Snapshot(room);
        }
    }

    public RoomSnapshot ResetSpinCategory(string connectionId, int expectedRevision)
    {
        var (room, player) = Authorize(connectionId, hostRequired: false);
        lock (room.Gate)
        {
            var state = AuthorizeSpinAction(room, player, expectedRevision, "CONFIRM");
            state.Category = null;
            state.QuestionId = null;
            state.QuestionText = null;
            AdvanceSpinState(state, "CHOICE");
            return Snapshot(room);
        }
    }

    public RoomSnapshot ActivateSpinQuestion(string connectionId, int expectedRevision)
    {
        var (room, player) = Authorize(connectionId, hostRequired: false);
        lock (room.Gate)
        {
            var state = AuthorizeSpinAction(room, player, expectedRevision, "CONFIRM");
            SetQuestion(state, exceptQuestionId: null);
            var now = timeProvider.GetUtcNow();
            AdvanceSpinState(state, "LOADING", (now + _questionLoadingTime).ToUnixTimeMilliseconds());
            return Snapshot(room);
        }
    }

    public RoomSnapshot PassSpinQuestion(string connectionId, string questionId, int expectedRevision)
    {
        var (room, player) = Authorize(connectionId, hostRequired: false);
        lock (room.Gate)
        {
            var state = AuthorizeQuestionAction(room, player, questionId, expectedRevision);
            SetQuestion(state, state.QuestionId);
            AdvanceSpinState(state, "QUESTION_ACTIVE");
            return Snapshot(room);
        }
    }

    public RoomSnapshot CompleteSpinQuestion(string connectionId, string questionId, int expectedRevision)
    {
        var (room, player) = Authorize(connectionId, hostRequired: false);
        lock (room.Gate)
        {
            var state = AuthorizeQuestionAction(room, player, questionId, expectedRevision);
            AdvanceSpinState(state, "RESOLVED");
            return Snapshot(room);
        }
    }

    public RoomSnapshot Leave(string connectionId)
    {
        var (room, player) = Authorize(connectionId, hostRequired: false);
        lock (room.Gate)
        {
            room.Players.Remove(player.Id);
            RemoveRetroRushPlayer(room, player.Id);
            ElectHost(room);
            if (room.Players.Count == 0) _rooms.TryRemove(room.Code, out _);
            return Snapshot(room);
        }
    }

    public RoomSnapshot? Disconnect(string connectionId)
    {
        foreach (var room in _rooms.Values)
        {
            lock (room.Gate)
            {
                var player = room.Players.Values.FirstOrDefault(candidate => candidate.ConnectionId == connectionId);
                if (player is null) continue;
                player.ConnectionId = null;
                player.DisconnectedAt = timeProvider.GetUtcNow();
                SetRetroRushPlayerConnected(room, player.Id, false);
                return Snapshot(room);
            }
        }
        return null;
    }

    public IReadOnlyList<RoomChange> SweepDisconnected()
    {
        var changes = new List<RoomChange>();
        var cutoff = timeProvider.GetUtcNow() - _disconnectGrace;
        foreach (var room in _rooms.Values)
        {
            lock (room.Gate)
            {
                var expired = room.Players.Values
                    .Where(player => player.DisconnectedAt is not null && player.DisconnectedAt <= cutoff)
                    .Select(player => player.Id).ToArray();
                if (expired.Length == 0) continue;
                foreach (var playerId in expired)
                {
                    room.Players.Remove(playerId);
                    RemoveRetroRushPlayer(room, playerId);
                }
                ElectHost(room);
                if (room.Players.Count == 0)
                {
                    _rooms.TryRemove(room.Code, out _);
                    changes.Add(new RoomChange(room.Code, null));
                }
                else changes.Add(new RoomChange(room.Code, Snapshot(room)));
            }
        }
        return changes;
    }

    public IReadOnlyList<TimedRoomChange> AdvanceTimedStates()
    {
        var changes = new List<TimedRoomChange>();
        var now = timeProvider.GetUtcNow().ToUnixTimeMilliseconds();
        foreach (var room in _rooms.Values)
        {
            lock (room.Gate)
            {
                var gameStarted = false;
                var spinStateChanged = false;
                if (room.Status == RoomPhase.GameSelection &&
                    room.VotingEndsAt is { } votingEnd && votingEnd <= now)
                {
                    gameStarted = ResolveVote(room);
                }

                if (room.SpinBottleState?.StateEndsAtUtc is { } stateEnd && stateEnd <= now)
                {
                    if (room.SpinBottleState.Status == "SPINNING")
                    {
                        AdvanceSpinState(room.SpinBottleState, "CHOICE");
                        spinStateChanged = true;
                    }
                    else if (room.SpinBottleState.Status == "LOADING")
                    {
                        AdvanceSpinState(room.SpinBottleState, "QUESTION_ACTIVE");
                        spinStateChanged = true;
                    }
                }

                if (gameStarted || spinStateChanged)
                    changes.Add(new TimedRoomChange(room.Code, Snapshot(room), gameStarted, spinStateChanged));
            }
        }
        return changes;
    }

    private void OpenGameSelection(GameRoom room, IReadOnlyList<string> candidateGameIds)
    {
        var candidates = candidateGameIds
            .Where(SupportedGames.Contains)
            .Distinct(StringComparer.Ordinal)
            .ToArray();
        if (candidates.Length == 0) candidates = SupportedGames.Order(StringComparer.Ordinal).ToArray();

        var now = timeProvider.GetUtcNow().ToUnixTimeMilliseconds();
        room.Status = RoomPhase.GameSelection;
        room.SelectedGameId = null;
        room.CurrentGameSession = null;
        room.LastSpinResult = null;
        room.SpinBottleState = null;
        room.Votes.Clear();
        room.CandidateGameIds = candidates;
        room.VotingStartedAt = now;
        room.VotingEndsAt = now + room.VotingTimeSeconds * 1000L;
        room.TieBreak = null;
    }

    private bool ResolveVote(GameRoom room)
    {
        if (room.Status != RoomPhase.GameSelection) return false;
        var candidates = room.CandidateGameIds;
        if (candidates.Count == 0) return false;

        var tally = room.Votes.Values
            .Where(candidates.Contains)
            .GroupBy(gameId => gameId, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.Count(), StringComparer.Ordinal);
        var votedCandidates = candidates.Where(gameId => tally.GetValueOrDefault(gameId) > 0).ToArray();
        var tiedCandidates = votedCandidates.Length == 0
            ? candidates.ToArray()
            : votedCandidates
                .Where(gameId => tally[gameId] == votedCandidates.Max(candidate => tally[candidate]))
                .ToArray();
        var winner = tiedCandidates[roomRandom.Next(tiedCandidates.Length)];

        room.SelectedGameId = winner;
        room.Status = RoomPhase.Playing;
        room.VotingStartedAt = null;
        room.VotingEndsAt = null;
        room.TieBreak = tiedCandidates.Length > 1 ? new TieBreakState(tiedCandidates, winner) : null;
        room.CurrentGameSession = new GameSession(
            Guid.NewGuid().ToString("N"), winner, Guid.NewGuid().ToString("N"),
            RandomNumberGenerator.GetInt32(int.MaxValue), "ACTIVE");
        if (winner == "retro-rush") InitializeRetroRush(room, room.CurrentGameSession);
        return true;
    }

    private RoomAdmission AddPlayer(GameRoom room, string displayName, string color)
    {
        var token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
        var player = new RoomPlayer(Guid.NewGuid().ToString("N"), displayName.Trim(), NormalizeColor(color), HashToken(token),
            timeProvider.GetUtcNow().ToUnixTimeMilliseconds());
        room.Players[player.Id] = player;
        var snapshot = Snapshot(room);
        return new RoomAdmission(room.Code, player.Id, player.DisplayName, player.Id == room.HostPlayerId, token,
            snapshot, PlayerSnapshot(room, player));
    }

    private (GameRoom Room, RoomPlayer Player) Authorize(string connectionId, bool hostRequired)
    {
        foreach (var room in _rooms.Values)
        {
            lock (room.Gate)
            {
                var player = room.Players.Values.FirstOrDefault(candidate => candidate.ConnectionId == connectionId);
                if (player is null) continue;
                if (hostRequired && room.HostPlayerId != player.Id) throw new RoomException("HOST_REQUIRED");
                return (room, player);
            }
        }
        throw new RoomException("NOT_ATTACHED");
    }

    private static RoomPlayer Authenticate(GameRoom room, string playerId, string token)
    {
        if (!room.Players.TryGetValue(playerId, out var player) ||
            !CryptographicOperations.FixedTimeEquals(player.TokenHash, HashToken(token)))
            throw new RoomException("INVALID_CREDENTIALS");
        return player;
    }

    private static void ElectHost(GameRoom room)
    {
        if (room.Players.ContainsKey(room.HostPlayerId)) return;
        room.HostPlayerId = room.Players.Values.OrderBy(player => player.JoinedAt).Select(player => player.Id).FirstOrDefault() ?? "";
    }

    private static SpinBottleState AuthorizeSpinAction(GameRoom room, RoomPlayer player, int expectedRevision, string expectedStatus)
    {
        var state = room.SpinBottleState ?? throw new RoomException("NO_ACTIVE_SPIN");
        if (state.TargetPlayerId != player.Id) throw new RoomException("NOT_QUESTION_OWNER");
        if (state.Revision != expectedRevision) throw new RoomException("STALE_SPIN_STATE");
        if (state.Status != expectedStatus) throw new RoomException("INVALID_SPIN_STATE");
        return state;
    }

    private static SpinBottleState AuthorizeQuestionAction(GameRoom room, RoomPlayer player, string questionId, int expectedRevision)
    {
        var state = AuthorizeSpinAction(room, player, expectedRevision, "QUESTION_ACTIVE");
        if (state.QuestionId != questionId) throw new RoomException("STALE_SPIN_STATE");
        return state;
    }

    private void SetQuestion(SpinBottleState state, string? exceptQuestionId)
    {
        if (state.Category is null || !SpinQuestions.TryGetValue(state.Category, out var questions))
            throw new RoomException("INVALID_QUESTION_CATEGORY");
        var candidateIndexes = Enumerable.Range(0, questions.Length)
            .Where(index => $"{state.Category}:{index}" != exceptQuestionId).ToArray();
        var questionIndex = candidateIndexes[roomRandom.Next(candidateIndexes.Length)];
        state.QuestionId = $"{state.Category}:{questionIndex}";
        state.QuestionText = questions[questionIndex];
    }

    private void AdvanceSpinState(SpinBottleState state, string status, long? stateEndsAtUtc = null)
    {
        state.Status = status;
        state.Revision++;
        state.UpdatedAtUtc = timeProvider.GetUtcNow().ToUnixTimeMilliseconds();
        state.StateEndsAtUtc = stateEndsAtUtc;
    }

    private GameRoom Find(string rawCode)
    {
        var code = Normalize(rawCode);
        return _rooms.TryGetValue(code, out var room) ? room : throw new RoomException("ROOM_NOT_FOUND");
    }

    private static string Normalize(string code) => code.Trim().ToUpperInvariant();
    private static byte[] HashToken(string token) => SHA256.HashData(Encoding.UTF8.GetBytes(token));
    private static string NormalizeColor(string color) => System.Text.RegularExpressions.Regex.IsMatch(color, "^#[0-9A-Fa-f]{6}$") ? color : "#6C5CE7";
    private static void ValidateName(string name)
    {
        if (string.IsNullOrWhiteSpace(name) || name.Trim().Length > 24) throw new RoomException("INVALID_DISPLAY_NAME");
    }

    private static string CreateRoomCode()
    {
        Span<char> result = stackalloc char[6];
        for (var index = 0; index < result.Length; index++) result[index] = Alphabet[RandomNumberGenerator.GetInt32(Alphabet.Length)];
        return new string(result);
    }

    private static RoomSnapshot Snapshot(GameRoom room) => new(
        room.Id, room.Code, room.RoomName, room.HostPlayerId,
        room.Players.Values.OrderBy(player => player.JoinedAt).Select(player => PlayerSnapshot(room, player)).ToArray(),
        room.SelectedGameId, room.Status.ToWire(), room.MaxParticipants, room.QuestionTimeSeconds, room.VotingTimeSeconds,
        new Dictionary<string, string>(room.Votes), room.VotingStartedAt, room.VotingEndsAt,
        room.CandidateGameIds.ToArray(),
        room.TieBreak is null ? null : new TieBreakSnapshot(room.TieBreak.Candidates, room.TieBreak.Winner),
        room.FileName, room.Description, room.CreatedAt,
        room.CurrentGameSession is null ? null : new GameSessionSnapshot(room.CurrentGameSession.Id, room.CurrentGameSession.GameId,
            room.CurrentGameSession.RoundId, room.CurrentGameSession.Seed, room.CurrentGameSession.State),
        room.SpinBottleState is null ? null : new SpinBottleStateSnapshot(room.SpinBottleState.SpinId,
            room.SpinBottleState.SpinnerPlayerId, room.SpinBottleState.TargetPlayerId, room.SpinBottleState.TargetIndex,
            room.SpinBottleState.Category, room.SpinBottleState.QuestionId, room.SpinBottleState.QuestionText,
            room.SpinBottleState.Status, room.SpinBottleState.Revision, room.SpinBottleState.UpdatedAtUtc,
            room.SpinBottleState.StateEndsAtUtc));

    private static RoomPlayerSnapshot PlayerSnapshot(GameRoom room, RoomPlayer player) => new(
        player.Id, player.DisplayName, player.Color, player.Id == room.HostPlayerId, true,
        player.ConnectionId is not null, player.JoinedAt);

    private sealed class GameRoom(string id, string code, string roomName, int maxParticipants,
        int questionTimeSeconds, int votingTimeSeconds, string? fileName, string? description, long createdAt)
    {
        public Lock Gate { get; } = new();
        public string Id { get; } = id;
        public string Code { get; } = code;
        public string RoomName { get; } = roomName;
        public int MaxParticipants { get; } = maxParticipants;
        public int QuestionTimeSeconds { get; } = questionTimeSeconds;
        public int VotingTimeSeconds { get; } = votingTimeSeconds;
        public string? FileName { get; } = fileName;
        public string? Description { get; } = description;
        public long CreatedAt { get; } = createdAt;
        public string HostPlayerId { get; set; } = "";
        public Dictionary<string, RoomPlayer> Players { get; } = new(StringComparer.Ordinal);
        public RoomPhase Status { get; set; } = RoomPhase.Lobby;
        public string? SelectedGameId { get; set; }
        public Dictionary<string, string> Votes { get; } = new(StringComparer.Ordinal);
        public long? VotingStartedAt { get; set; }
        public long? VotingEndsAt { get; set; }
        public IReadOnlyList<string> CandidateGameIds { get; set; } = [];
        public TieBreakState? TieBreak { get; set; }
        public GameSession? CurrentGameSession { get; set; }
        public SpinResult? LastSpinResult { get; set; }
        public SpinBottleState? SpinBottleState { get; set; }
    }

    private sealed class RoomPlayer(string id, string displayName, string color, byte[] tokenHash, long joinedAt)
    {
        public string Id { get; } = id;
        public string DisplayName { get; } = displayName;
        public string Color { get; } = color;
        public byte[] TokenHash { get; } = tokenHash;
        public long JoinedAt { get; } = joinedAt;
        public string? ConnectionId { get; set; }
        public DateTimeOffset? DisconnectedAt { get; set; }
    }

    private sealed class GameSession(string id, string gameId, string roundId, int seed, string state)
    {
        public string Id { get; } = id;
        public string GameId { get; } = gameId;
        public string RoundId { get; set; } = roundId;
        public int Seed { get; set; } = seed;
        public string State { get; set; } = state;
        public RetroRushState? RetroRush { get; set; }
    }

    private sealed record TieBreakState(IReadOnlyList<string> Candidates, string Winner);

    private sealed class SpinBottleState(string spinId, string spinnerPlayerId, string targetPlayerId, int targetIndex,
        string? category, string? questionId, string? questionText, string status, int revision, long updatedAtUtc,
        long? stateEndsAtUtc)
    {
        public string SpinId { get; } = spinId;
        public string SpinnerPlayerId { get; } = spinnerPlayerId;
        public string TargetPlayerId { get; } = targetPlayerId;
        public int TargetIndex { get; } = targetIndex;
        public string? Category { get; set; } = category;
        public string? QuestionId { get; set; } = questionId;
        public string? QuestionText { get; set; } = questionText;
        public string Status { get; set; } = status;
        public int Revision { get; set; } = revision;
        public long UpdatedAtUtc { get; set; } = updatedAtUtc;
        public long? StateEndsAtUtc { get; set; } = stateEndsAtUtc;
    }
}

public sealed record AuthenticatedPlayer(string RoomCode, string PlayerId, string DisplayName, string Color);
public sealed record RoomChange(string RoomCode, RoomSnapshot? Snapshot);
public sealed record VoteResolution(RoomSnapshot Snapshot, bool GameStarted);
public sealed record TimedRoomChange(string RoomCode, RoomSnapshot Snapshot, bool GameStarted, bool SpinStateChanged);
public sealed class RoomException(string code) : Exception(code) { public string Code { get; } = code; }
internal enum RoomPhase { Lobby, GameSelection, Playing, Closed }
internal static class RoomPhaseExtensions
{
    public static string ToWire(this RoomPhase phase) => phase switch
    {
        RoomPhase.Lobby => "LOBBY",
        RoomPhase.GameSelection => "GAME_SELECTION",
        RoomPhase.Playing => "PLAYING",
        _ => "CLOSED",
    };
}
