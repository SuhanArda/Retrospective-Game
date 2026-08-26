using Retrospective.Server.Contracts;

namespace Retrospective.Server.Rooms;

public sealed partial class RoomManager
{
    private const string ImposterGameId = "imposter";
    private const int ImposterMinPlayers = 3;
    private const int ImposterMaxPlayers = 10;
    private const int ImposterAvatarCount = 10;

    public ImposterGameSnapshot GetImposterSnapshot(string connectionId, string gameSessionId)
    {
        var (room, authenticated) = Authorize(connectionId, hostRequired: false);
        lock (room.Gate)
        {
            var state = RequireImposter(room, gameSessionId);
            RequireImposterPlayer(state, authenticated.Id);
            return Snapshot(room, state, authenticated.Id);
        }
    }

    public ImposterMutation ReadyImposterRole(string connectionId, string gameSessionId)
    {
        var (room, authenticated) = Authorize(connectionId, hostRequired: false);
        lock (room.Gate)
        {
            var state = RequireImposter(room, gameSessionId);
            RequireImposterPlayer(state, authenticated.Id);
            if (state.Phase != "ROLE_REVEAL") throw new RoomException("INVALID_IMPOSTER_PHASE");
            if (!state.ReadyPlayerIds.Add(authenticated.Id)) return Mutation(room, state);
            if (state.ReadyPlayerIds.Count == state.PlayerIds.Count) state.Phase = "CLUE_GIVING";
            state.Revision++;
            return Mutation(room, state);
        }
    }

    public ImposterMutation CompleteImposterClue(string connectionId, string gameSessionId)
    {
        var (room, authenticated) = Authorize(connectionId, hostRequired: false);
        lock (room.Gate)
        {
            var state = RequireImposter(room, gameSessionId);
            RequireImposterPlayer(state, authenticated.Id);
            if (state.Phase != "CLUE_GIVING") throw new RoomException("INVALID_IMPOSTER_PHASE");
            if (CurrentSpeaker(state) != authenticated.Id) throw new RoomException("NOT_CURRENT_SPEAKER");
            if (!state.CluePlayerIds.Add(authenticated.Id)) throw new RoomException("CLUE_ALREADY_COMPLETED");
            if (state.CluePlayerIds.Count == state.PlayerIds.Count)
            {
                state.Phase = "VOTING";
            }
            else
            {
                state.SpeakerIndex = FindNextSpeakerIndex(state, state.SpeakerIndex + 1);
            }
            state.Revision++;
            return Mutation(room, state);
        }
    }

    public ImposterMutation CastImposterVote(string connectionId, CastImposterVoteRequest request)
    {
        var (room, authenticated) = Authorize(connectionId, hostRequired: false);
        lock (room.Gate)
        {
            var state = RequireImposter(room, request.GameSessionId);
            RequireImposterPlayer(state, authenticated.Id);
            if (state.Phase != "VOTING") throw new RoomException("INVALID_IMPOSTER_PHASE");
            if (authenticated.Id == request.TargetPlayerId) throw new RoomException("SELF_VOTE");
            RequireImposterPlayer(state, request.TargetPlayerId);
            if (!state.Votes.TryAdd(authenticated.Id, request.TargetPlayerId)) throw new RoomException("ALREADY_VOTED");
            if (state.Votes.Count == state.PlayerIds.Count) state.Phase = "RESULTS";
            state.Revision++;
            return Mutation(room, state);
        }
    }

    public ImposterMutation StartNextImposterRound(string connectionId, string gameSessionId)
    {
        var (room, _) = Authorize(connectionId, hostRequired: true);
        lock (room.Gate)
        {
            var current = RequireImposter(room, gameSessionId);
            if (current.Phase != "RESULTS") throw new RoomException("INVALID_IMPOSTER_PHASE");
            var session = room.CurrentGameSession!;
            session.RoundId = Guid.NewGuid().ToString("N");
            session.Imposter = CreateImposterState(
                room,
                session.Id,
                current.RoundNumber + 1,
                current.Revision + 1,
                current.PackIndex,
                current.BackgroundId,
                current.AvatarIndicesByPlayerId);
            return Mutation(room, session.Imposter);
        }
    }

    public ImposterMutation SetImposterBackground(string connectionId, string gameSessionId, string backgroundId)
    {
        var (room, _) = Authorize(connectionId, hostRequired: true);
        lock (room.Gate)
        {
            var state = RequireImposter(room, gameSessionId);
            if (!ImposterDemoCatalog.BackgroundIds.Contains(backgroundId))
                throw new RoomException("INVALID_IMPOSTER_BACKGROUND");
            if (state.BackgroundId == backgroundId) return Mutation(room, state);
            state.BackgroundId = backgroundId;
            state.Revision++;
            return Mutation(room, state);
        }
    }

    private void InitializeImposter(GameRoom room, GameSession session) =>
        session.Imposter = CreateImposterState(room, session.Id, 1, 1, null, "balcony", null);

    private ImposterState CreateImposterState(
        GameRoom room,
        string gameSessionId,
        int roundNumber,
        int revision,
        int? previousPackIndex,
        string backgroundId,
        IReadOnlyDictionary<string, int>? previousAvatarIndices)
    {
        var playerIds = room.Players.Values
            .OrderBy(player => player.JoinedAt)
            .Select(player => player.Id)
            .ToList();
        if (playerIds.Count is < ImposterMinPlayers or > ImposterMaxPlayers)
            throw new RoomException("IMPOSTER_PLAYER_COUNT_OUT_OF_RANGE");

        var packIndex = previousPackIndex is null
            ? roomRandom.Next(ImposterDemoCatalog.Words.Count)
            : (previousPackIndex.Value + 1 + roomRandom.Next(ImposterDemoCatalog.Words.Count - 1)) % ImposterDemoCatalog.Words.Count;
        var imposterPlayerId = playerIds[roomRandom.Next(playerIds.Count)];
        var avatarIndices = previousAvatarIndices is null
            ? RandomAvatarIndices(playerIds)
            : playerIds.ToDictionary(
                playerId => playerId,
                playerId => previousAvatarIndices[playerId],
                StringComparer.Ordinal);
        var clueOrderPlayerIds = playerIds.ToList();
        Shuffle(clueOrderPlayerIds);
        return new ImposterState(
            gameSessionId,
            roundNumber,
            revision,
            packIndex,
            playerIds,
            clueOrderPlayerIds,
            avatarIndices,
            imposterPlayerId,
            backgroundId);
    }

    private Dictionary<string, int> RandomAvatarIndices(IReadOnlyList<string> playerIds)
    {
        var availableAvatarIndices = Enumerable.Range(0, ImposterAvatarCount).ToArray();
        var assignments = new Dictionary<string, int>(playerIds.Count, StringComparer.Ordinal);
        for (var playerIndex = 0; playerIndex < playerIds.Count; playerIndex++)
        {
            var selectedIndex = roomRandom.Next(playerIndex, availableAvatarIndices.Length);
            (availableAvatarIndices[playerIndex], availableAvatarIndices[selectedIndex]) =
                (availableAvatarIndices[selectedIndex], availableAvatarIndices[playerIndex]);
            assignments[playerIds[playerIndex]] = availableAvatarIndices[playerIndex];
        }
        return assignments;
    }

    private void Shuffle<T>(IList<T> values)
    {
        for (var index = 0; index < values.Count - 1; index++)
        {
            var selectedIndex = roomRandom.Next(index, values.Count);
            (values[index], values[selectedIndex]) = (values[selectedIndex], values[index]);
        }
    }

    private static ImposterState RequireImposter(GameRoom room, string gameSessionId)
    {
        var session = room.CurrentGameSession;
        if (session is null || session.Id != gameSessionId || session.GameId != ImposterGameId || session.State != "ACTIVE")
            throw new RoomException("WRONG_GAME_SESSION");
        return session.Imposter ?? throw new RoomException("IMPOSTER_NOT_INITIALIZED");
    }

    private static void RequireImposterPlayer(ImposterState state, string playerId)
    {
        if (!state.PlayerIds.Contains(playerId, StringComparer.Ordinal))
            throw new RoomException("PLAYER_NOT_IN_SESSION");
    }

    private static string? CurrentSpeaker(ImposterState state) =>
        state.Phase == "CLUE_GIVING" && state.ClueOrderPlayerIds.Count > 0
            ? state.ClueOrderPlayerIds[state.SpeakerIndex]
            : null;

    private static int FindNextSpeakerIndex(ImposterState state, int startIndex)
    {
        for (var offset = 0; offset < state.ClueOrderPlayerIds.Count; offset++)
        {
            var index = (startIndex + offset) % state.ClueOrderPlayerIds.Count;
            if (!state.CluePlayerIds.Contains(state.ClueOrderPlayerIds[index])) return index;
        }
        return 0;
    }

    private static ImposterMutation Mutation(GameRoom room, ImposterState state) =>
        new(room.Code, new ImposterStateChanged(state.GameSessionId, state.RoundNumber, state.Revision));

    private static ImposterGameSnapshot Snapshot(GameRoom room, ImposterState state, string playerId)
    {
        var pack = ImposterDemoCatalog.Words[state.PackIndex];
        var isImposter = state.ImposterPlayerId == playerId;
        var revealSecrets = state.Phase == "RESULTS";
        var players = state.PlayerIds.Select(id =>
        {
            var player = room.Players[id];
            return new ImposterPlayerSnapshot(
                id,
                player.DisplayName,
                state.AvatarIndicesByPlayerId[id],
                player.ConnectionId is not null,
                state.ReadyPlayerIds.Contains(id),
                state.CluePlayerIds.Contains(id),
                state.Votes.ContainsKey(id));
        }).ToArray();

        return new ImposterGameSnapshot(
            state.GameSessionId,
            state.RoundNumber,
            state.Revision,
            state.Phase,
            state.BackgroundId,
            players,
            CurrentSpeaker(state),
            isImposter ? "IMPOSTER" : "CREW",
            !isImposter || revealSecrets ? pack.SecretWord : null,
            revealSecrets ? pack.Category : null,
            revealSecrets ? pack.RetroQuestion : null,
            state.Votes.ContainsKey(playerId),
            revealSecrets ? ResolveImposterResult(state) : null);
    }

    private static ImposterResultSnapshot ResolveImposterResult(ImposterState state)
    {
        var totals = state.Votes.Values
            .GroupBy(targetId => targetId, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.Count(), StringComparer.Ordinal);
        var highest = totals.Count == 0 ? 0 : totals.Values.Max();
        var suspected = totals
            .Where(entry => entry.Value == highest)
            .Select(entry => entry.Key)
            .Order(StringComparer.Ordinal)
            .ToArray();
        return new ImposterResultSnapshot(
            state.ImposterPlayerId,
            suspected,
            suspected.Length == 1 && suspected[0] == state.ImposterPlayerId);
    }

    private static void RemoveImposterPlayer(GameRoom room, string playerId)
    {
        var state = room.CurrentGameSession?.Imposter;
        if (state is null) return;
        var removedIndex = state.PlayerIds.IndexOf(playerId);
        if (removedIndex < 0) return;

        var removedSpeakerIndex = state.ClueOrderPlayerIds.IndexOf(playerId);
        var wasCurrentSpeaker = CurrentSpeaker(state) == playerId;
        state.PlayerIds.RemoveAt(removedIndex);
        if (removedSpeakerIndex >= 0) state.ClueOrderPlayerIds.RemoveAt(removedSpeakerIndex);
        state.AvatarIndicesByPlayerId.Remove(playerId);
        state.ReadyPlayerIds.Remove(playerId);
        state.CluePlayerIds.Remove(playerId);
        state.Votes.Remove(playerId);
        foreach (var voterId in state.Votes.Where(entry => entry.Value == playerId).Select(entry => entry.Key).ToArray())
            state.Votes.Remove(voterId);

        if (state.PlayerIds.Count < ImposterMinPlayers || state.ImposterPlayerId == playerId)
        {
            state.Phase = "RESULTS";
        }
        else if (state.Phase == "ROLE_REVEAL" && state.ReadyPlayerIds.Count == state.PlayerIds.Count)
        {
            state.Phase = "CLUE_GIVING";
            state.SpeakerIndex = 0;
        }
        else if (state.Phase == "CLUE_GIVING")
        {
            if (state.CluePlayerIds.Count == state.PlayerIds.Count) state.Phase = "VOTING";
            else
            {
                var startIndex = wasCurrentSpeaker
                    ? removedSpeakerIndex
                    : Math.Max(0, state.SpeakerIndex - (removedSpeakerIndex < state.SpeakerIndex ? 1 : 0));
                state.SpeakerIndex = FindNextSpeakerIndex(state, startIndex % state.ClueOrderPlayerIds.Count);
            }
        }
        else if (state.Phase == "VOTING" && state.Votes.Count == state.PlayerIds.Count)
        {
            state.Phase = "RESULTS";
        }
        state.Revision++;
    }

    private sealed class ImposterState(
        string gameSessionId,
        int roundNumber,
        int revision,
        int packIndex,
        List<string> playerIds,
        List<string> clueOrderPlayerIds,
        Dictionary<string, int> avatarIndicesByPlayerId,
        string imposterPlayerId,
        string backgroundId)
    {
        public string GameSessionId { get; } = gameSessionId;
        public int RoundNumber { get; } = roundNumber;
        public int Revision { get; set; } = revision;
        public int PackIndex { get; } = packIndex;
        public List<string> PlayerIds { get; } = playerIds;
        public List<string> ClueOrderPlayerIds { get; } = clueOrderPlayerIds;
        public Dictionary<string, int> AvatarIndicesByPlayerId { get; } = avatarIndicesByPlayerId;
        public string ImposterPlayerId { get; } = imposterPlayerId;
        public string BackgroundId { get; set; } = backgroundId;
        public string Phase { get; set; } = "ROLE_REVEAL";
        public int SpeakerIndex { get; set; }
        public HashSet<string> ReadyPlayerIds { get; } = new(StringComparer.Ordinal);
        public HashSet<string> CluePlayerIds { get; } = new(StringComparer.Ordinal);
        public Dictionary<string, string> Votes { get; } = new(StringComparer.Ordinal);
    }
}

public sealed record ImposterMutation(string RoomCode, ImposterStateChanged Event);
