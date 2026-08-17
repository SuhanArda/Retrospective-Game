using System.Text.RegularExpressions;
using Retrospective.Server.Contracts;

namespace Retrospective.Server.Rooms;

public sealed partial class RoomManager
{
    private const double RetroRushSpawnX = 180;
    private const double RetroRushSpawnY = 540;
    private const double RetroRushShoveRange = 55;
    private const double RetroRushShoveVelocity = 300;
    private const int RetroRushShoveCooldownMs = 600;
    private const int RetroRushShoveHitStunMs = 150;
    private const double RetroRushRocketTargetRange = 900;
    private const double RetroRushRocketKnockbackX = -450;
    private const int RetroRushRocketCooldownMs = 10_000;
    private const int RetroRushRocketHitStunMs = 250;
    private const int RetroRushRocketLifetimeMs = 5_000;
    private const int RetroRushCountdownMs = 3_500;
    private const int RetroRushSpeedCooldownMs = 15_000;
    private const int RetroRushAskCooldownMs = 30_000;
    private const int RetroRushQuestionPoolSize = 20;
    private static readonly Regex PickupIdPattern = new(
        "^chunk-[0-9]+-[a-z0-9-]+-pickup-[0-9]+$", RegexOptions.Compiled | RegexOptions.CultureInvariant);
    private static readonly HashSet<string> MovementStates =
        ["ACTIVE", "INVULNERABLE"];
    private static readonly HashSet<string> AnimationStates =
        ["idle", "running", "jumping", "falling", "hit", "eliminated"];
    private static readonly HashSet<string> AbilityIds = ["speed", "rocket", "ask"];
    private static readonly HashSet<string> ControlledShoveRejections =
        ["WRONG_GAME_SESSION", "WRONG_ROUND", "PLAYER_NOT_IN_SESSION", "SELF_SHOVE", "PLAYER_NOT_ACTIVE", "SHOVE_COOLDOWN", "SHOVE_OUT_OF_RANGE"];
    private static readonly RetroQuestionDefinition[] RetroRushQuestions =
    [
        new("q1", "Went well", "text", "Bu sprintte neler iyi gitti?", null, true),
        new("q2", "Challenges", "text", "Takımı yavaşlatan ne oldu?", null, true),
        new("q3", "Improvement", "text", "Bir sonraki sprintte neyi farklı yapmalıyız?", null, true),
        new("q4", "Appreciation", "text", "Kime, neden teşekkür etmek istersin?", null, false),
        new("q5", "Challenges", "singleChoice", "En çok hangi alana odaklanmamız gerekiyor?", ["Planlama", "İletişim", "Araçlar", "Odaklanma"], true),
        new("q6", "Team mood", "rating", "Bu sprinti nasıl değerlendirirsin?", ["1", "2", "3", "4", "5"], true),
        new("q7", "Next sprint", "text", "Takımın bir sonraki sprintte atması gereken tek adım nedir?", null, true),
        new("q8", "Went well", "text", "Hangi iş birliği anı en çok yardımcı oldu?", null, false),
        new("q9", "Improvement", "singleChoice", "Sürtünmeyi nerede azaltabiliriz?", ["Toplantılar", "İncelemeler", "Dağıtımlar", "Devirler"], true),
        new("q10", "Team mood", "rating", "Çalışma tempomuz ne kadar sürdürülebilirdi?", ["1", "2", "3", "4", "5"], true),
        new("q11", "Appreciation", "text", "Hangi takım davranışını kutlamalıyız?", null, false),
        new("q12", "Challenges", "text", "Hangi süreç beklenenden daha uzun sürdü?", null, true),
        new("q13", "Next sprint", "singleChoice", "Bir sonraki sprintte en çok neyi korumalıyız?", ["Odaklanma zamanı", "Kalite", "Öğrenme", "Takım bağı"], true),
        new("q14", "Went well", "text", "Bu sprintte kendine güvenmene ne yardımcı oldu?", null, false),
        new("q15", "Improvement", "text", "Hangi küçük deneyi denemeliyiz?", null, true),
    ];

    public RetroRushGameSnapshot GetRetroRushSnapshot(string connectionId, string gameSessionId)
    {
        var (room, _) = Authorize(connectionId, hostRequired: false);
        lock (room.Gate)
        {
            var state = RequireRetroRush(room, gameSessionId);
            RefreshRetroRushPhase(state);
            return Snapshot(state);
        }
    }

    public RetroRushGameSnapshot? GetRetroRushSnapshotForRoom(string rawCode)
    {
        var room = Find(rawCode);
        lock (room.Gate)
        {
            var state = room.CurrentGameSession?.RetroRush;
            if (state is null) return null;
            RefreshRetroRushPhase(state);
            return Snapshot(state);
        }
    }

    public RetroRushMutation<RetroRushPlayerSnapshot> UpdateRetroRushPlayer(
        string connectionId, UpdateRetroRushPlayerRequest request)
    {
        var (room, authenticated) = Authorize(connectionId, hostRequired: false);
        lock (room.Gate)
        {
            var state = RequireRetroRush(room, request.GameSessionId, request.RoundId);
            RefreshRetroRushPhase(state);
            if (authenticated.Id != request.PlayerId) throw new RoomException("PLAYER_ID_MISMATCH");
            if (!Finite(request.X, request.Y, request.VelocityX, request.VelocityY) ||
                Math.Abs(request.X) > 1_000_000 || Math.Abs(request.Y) > 1_000_000)
                throw new RoomException("INVALID_PLAYER_SNAPSHOT");
            if (request.Facing is not ("left" or "right") ||
                !MovementStates.Contains(request.MovementState) || !AnimationStates.Contains(request.AnimationState))
                throw new RoomException("INVALID_PLAYER_SNAPSHOT");
            var player = RequirePlayer(state, authenticated.Id);
            if (request.Sequence <= player.Sequence) return new(room.Code, null);
            if (state.Phase != "RUNNING" || !IsActive(player)) throw new RoomException("PLAYER_NOT_ACTIVE");
            player.X = request.X;
            player.Y = request.Y;
            player.VelocityX = request.VelocityX;
            player.VelocityY = request.VelocityY;
            player.Facing = request.Facing;
            player.MovementState = request.MovementState;
            player.AnimationState = request.AnimationState;
            player.Sequence = request.Sequence;
            player.ClientTimestamp = request.ClientTimestamp;
            return new(room.Code, Snapshot(player, state.RoundId));
        }
    }

    public RetroRushShoveMutation RequestRetroRushShove(
        string connectionId, RequestRetroRushShoveRequest request)
    {
        var (room, authenticated) = Authorize(connectionId, hostRequired: false);
        lock (room.Gate)
        {
            try
            {
                var state = RequireRetroRush(room, request.GameSessionId, request.RoundId);
                RefreshRetroRushPhase(state);
                var attacker = RequirePlayer(state, authenticated.Id);
                var target = RequirePlayer(state, request.TargetPlayerId);
                if (attacker.PlayerId == target.PlayerId) throw new RoomException("SELF_SHOVE");
                if (request.Sequence <= attacker.LastShoveSequence)
                    return RetroRushShoveMutation.Rejected(room.Code, "DUPLICATE_SHOVE");
                if (state.Phase != "RUNNING" || !IsActive(attacker) || !IsActive(target))
                    throw new RoomException("PLAYER_NOT_ACTIVE");
                var now = timeProvider.GetUtcNow().ToUnixTimeMilliseconds();
                if (attacker.LastShoveAtUtc != 0 && now - attacker.LastShoveAtUtc < RetroRushShoveCooldownMs)
                    throw new RoomException("SHOVE_COOLDOWN");
                var distanceSquared = Math.Pow(target.X - attacker.X, 2) + Math.Pow(target.Y - attacker.Y, 2);
                if (distanceSquared > RetroRushShoveRange * RetroRushShoveRange) throw new RoomException("SHOVE_OUT_OF_RANGE");
                attacker.LastShoveAtUtc = now;
                attacker.LastShoveSequence = request.Sequence;
                var velocityX = target.X >= attacker.X ? RetroRushShoveVelocity : -RetroRushShoveVelocity;
                var applied = new RetroRushShoveApplied(
                    $"{state.RoundId}:{attacker.PlayerId}:{request.Sequence}", state.RoundId,
                    attacker.PlayerId, target.PlayerId, velocityX, RetroRushShoveHitStunMs);
                return RetroRushShoveMutation.Accepted(room.Code, applied);
            }
            catch (RoomException error) when (ControlledShoveRejections.Contains(error.Code))
            {
                var rejection = error.Code switch
                {
                    "WRONG_ROUND" => "STALE_ROUND",
                    "PLAYER_NOT_IN_SESSION" => "INVALID_SHOVE_TARGET",
                    _ => error.Code,
                };
                return RetroRushShoveMutation.Rejected(room.Code, rejection);
            }
        }
    }

    public RetroRushMutation<RetroRushRocketSnapshot> RequestRetroRushRocketFire(
        string connectionId, RequestRetroRushRocketFireRequest request)
    {
        var (room, authenticated) = Authorize(connectionId, hostRequired: false);
        lock (room.Gate)
        {
            var state = RequireRetroRush(room, request.GameSessionId, request.RoundId);
            RefreshRetroRushPhase(state);
            var owner = RequirePlayer(state, authenticated.Id);
            if (state.Phase != "RUNNING" || !IsActive(owner)) throw new RoomException("PLAYER_NOT_ACTIVE");
            if (!owner.OwnedAbilityIds.Contains("rocket")) throw new RoomException("ABILITY_NOT_OWNED");
            var now = timeProvider.GetUtcNow().ToUnixTimeMilliseconds();
            if (now < owner.RocketReadyAtUtc) throw new RoomException("ROCKET_COOLDOWN");
            var target = state.Players.Values
                .Where(candidate => candidate.PlayerId != owner.PlayerId && IsActive(candidate))
                .Select(candidate => new { Player = candidate, Distance = DistanceSquared(owner, candidate) })
                .Where(candidate => candidate.Distance <= RetroRushRocketTargetRange * RetroRushRocketTargetRange)
                .OrderBy(candidate => candidate.Distance)
                .ThenBy(candidate => candidate.Player.PlayerId, StringComparer.Ordinal)
                .Select(candidate => candidate.Player)
                .FirstOrDefault() ?? throw new RoomException("NO_ROCKET_TARGET");
            owner.RocketReadyAtUtc = now + RetroRushRocketCooldownMs;
            var rocket = new RetroRushRocketState(
                Guid.NewGuid().ToString("N"), owner.PlayerId, target.PlayerId, owner.X, owner.Y, now, state.RoundId);
            state.ActiveRockets[rocket.RocketId] = rocket;
            return new(room.Code, Snapshot(rocket));
        }
    }

    public RetroRushMutation<RetroRushRocketHitApplied> RequestRetroRushRocketHit(
        string connectionId, RequestRetroRushRocketHitRequest request)
    {
        var (room, authenticated) = Authorize(connectionId, hostRequired: false);
        lock (room.Gate)
        {
            var state = RequireRetroRush(room, request.GameSessionId, request.RoundId);
            if (!state.ActiveRockets.TryGetValue(request.RocketId, out var rocket)) return new(room.Code, null);
            if (rocket.OwnerPlayerId != authenticated.Id) throw new RoomException("ROCKET_OWNER_REQUIRED");
            if (rocket.RoundId != state.RoundId) throw new RoomException("WRONG_ROUND");
            var target = RequirePlayer(state, rocket.TargetPlayerId);
            if (!IsActive(target)) throw new RoomException("PLAYER_NOT_ACTIVE");
            state.ActiveRockets.Remove(rocket.RocketId);
            return new(room.Code, new RetroRushRocketHitApplied(
                rocket.RocketId, state.RoundId, target.PlayerId, RetroRushRocketKnockbackX, RetroRushRocketHitStunMs));
        }
    }

    public RetroRushMutation<RetroRushPickupCollected> RequestRetroRushPickupCollection(
        string connectionId, RequestRetroRushPickupCollectionRequest request)
    {
        var (room, authenticated) = Authorize(connectionId, hostRequired: false);
        lock (room.Gate)
        {
            var state = RequireRetroRush(room, request.GameSessionId, request.RoundId);
            RefreshRetroRushPhase(state);
            var player = RequirePlayer(state, authenticated.Id);
            if (state.Phase != "RUNNING" || !IsActive(player)) throw new RoomException("PLAYER_NOT_ACTIVE");
            if (!PickupIdPattern.IsMatch(request.PickupId) || !AbilityIds.Contains(request.AbilityId))
                throw new RoomException("INVALID_PICKUP");
            if (!state.CollectedPickupIds.Add(request.PickupId)) return new(room.Code, null);
            player.OwnedAbilityIds.Add(request.AbilityId);
            if (request.AbilityId == "rocket") player.RocketReadyAtUtc = 0;
            else if (request.AbilityId == "speed") player.SpeedReadyAtUtc = 0;
            else if (request.AbilityId == "ask") player.AskReadyAtUtc = 0;
            return new(room.Code, new RetroRushPickupCollected(
                request.PickupId, state.RoundId, player.PlayerId, request.AbilityId));
        }
    }

    public RetroRushMutation<RetroRushPlayerEliminated> RequestRetroRushPlayerElimination(
        string connectionId, RequestRetroRushPlayerEliminationRequest request)
    {
        var (room, authenticated) = Authorize(connectionId, hostRequired: false);
        lock (room.Gate)
        {
            var state = RequireRetroRush(room, request.GameSessionId, request.RoundId);
            RefreshRetroRushPhase(state);
            if (authenticated.Id != request.PlayerId) throw new RoomException("PLAYER_ID_MISMATCH");
            var player = RequirePlayer(state, authenticated.Id);
            if (!IsActive(player)) return new(room.Code, null);
            if (state.Phase != "RUNNING") throw new RoomException("INVALID_RETRO_RUSH_PHASE");
            player.MovementState = "ANSWERING_QUESTION";
            player.AnimationState = "eliminated";
            var definition = RetroRushQuestions[(state.RoundId - 1) % RetroRushQuestions.Length];
            var questionIndex = (state.RoundId - 1) % RetroRushQuestionPoolSize;
            var question = new RetroRushQuestionSnapshot(
                definition.Id, questionIndex, player.PlayerId, "ACTIVE", state.RoundId, definition.Category, definition.Type,
                definition.Prompt, definition.Options, definition.Required);
            state.ActiveQuestion = question;
            state.Phase = "QUESTION";
            state.PhaseStartedAtUtc = timeProvider.GetUtcNow().ToUnixTimeMilliseconds();
            state.ActiveRockets.Clear();
            return new(room.Code, new RetroRushPlayerEliminated(state.RoundId, player.PlayerId, question));
        }
    }

    public void UseRetroRushAbility(string connectionId, UseRetroRushAbilityRequest request)
    {
        var (room, authenticated) = Authorize(connectionId, hostRequired: false);
        lock (room.Gate)
        {
            var state = RequireRetroRush(room, request.GameSessionId, request.RoundId);
            RefreshRetroRushPhase(state);
            var player = RequirePlayer(state, authenticated.Id);
            if (state.Phase != "RUNNING" || !IsActive(player)) throw new RoomException("PLAYER_NOT_ACTIVE");
            if (!AbilityIds.Contains(request.AbilityId)) throw new RoomException("INVALID_ABILITY");
            if (!player.OwnedAbilityIds.Contains(request.AbilityId)) throw new RoomException("ABILITY_NOT_OWNED");
            var now = timeProvider.GetUtcNow().ToUnixTimeMilliseconds();
            if (request.AbilityId == "speed")
            {
                if (now < player.SpeedReadyAtUtc) throw new RoomException("SPEED_COOLDOWN");
                player.SpeedReadyAtUtc = now + RetroRushSpeedCooldownMs;
            }
            else if (request.AbilityId == "ask")
            {
                if (now < player.AskReadyAtUtc) throw new RoomException("ASK_COOLDOWN");
                player.AskReadyAtUtc = now + RetroRushAskCooldownMs;
                player.AskSelectionExpiresAtUtc = now + 10_000;
            }
            else throw new RoomException("INVALID_ABILITY");
        }
    }

    public RetroRushMutation<RetroRushTargetQuestioned> RequestRetroRushAskTarget(
        string connectionId, RequestRetroRushAskTargetRequest request)
    {
        var (room, authenticated) = Authorize(connectionId, hostRequired: false);
        lock (room.Gate)
        {
            var state = RequireRetroRush(room, request.GameSessionId, request.RoundId);
            RefreshRetroRushPhase(state);
            var source = RequirePlayer(state, authenticated.Id);
            var target = RequirePlayer(state, request.TargetPlayerId);
            if (source.PlayerId == target.PlayerId) throw new RoomException("SELF_TARGET");
            if (state.Phase != "RUNNING" || !IsActive(source) || !IsActive(target))
                throw new RoomException("PLAYER_NOT_ACTIVE");
            var now = timeProvider.GetUtcNow().ToUnixTimeMilliseconds();
            if (source.AskSelectionExpiresAtUtc < now) throw new RoomException("ASK_NOT_ACTIVATED");
            source.AskSelectionExpiresAtUtc = 0;
            return new(room.Code, new RetroRushTargetQuestioned(state.RoundId, source.PlayerId, target.PlayerId));
        }
    }

    public RetroRushMutation<RetroRushGameSnapshot> CompleteRetroRushQuestion(
        string connectionId, CompleteRetroRushQuestionRequest request)
    {
        var (room, authenticated) = Authorize(connectionId, hostRequired: false);
        lock (room.Gate)
        {
            var session = room.CurrentGameSession ?? throw new RoomException("NO_ACTIVE_GAME_SESSION");
            var state = RequireRetroRush(room, request.GameSessionId, request.RoundId);
            var question = state.ActiveQuestion ?? throw new RoomException("NO_ACTIVE_QUESTION");
            if (state.Phase != "QUESTION" || question.OwnerPlayerId != authenticated.Id)
                throw new RoomException("NOT_QUESTION_OWNER");
            if (question.QuestionId != request.QuestionId) throw new RoomException("STALE_QUESTION");
            state.RoundId++;
            var nextSeed = roomRandom.Next(int.MaxValue);
            if (nextSeed == state.MapSeed) nextSeed = nextSeed == int.MaxValue - 1 ? 0 : nextSeed + 1;
            state.MapSeed = nextSeed;
            session.RoundId = state.RoundId.ToString(System.Globalization.CultureInfo.InvariantCulture);
            session.Seed = nextSeed;
            ResetRetroRushRound(state);
            return new(room.Code, Snapshot(state));
        }
    }

    private void InitializeRetroRush(GameRoom room, GameSession session)
    {
        session.RoundId = "1";
        var now = timeProvider.GetUtcNow().ToUnixTimeMilliseconds();
        var state = new RetroRushState(session.Id, 1, session.Seed, now, now + RetroRushCountdownMs);
        foreach (var entry in room.Players.Values.OrderBy(player => player.JoinedAt).Select((player, slot) => (player, slot)))
            state.Players[entry.player.Id] = NewPlayer(entry.player, entry.slot);
        session.RetroRush = state;
    }

    private void ResetRetroRushRound(RetroRushState state)
    {
        var now = timeProvider.GetUtcNow().ToUnixTimeMilliseconds();
        state.Phase = "COUNTDOWN";
        state.PhaseStartedAtUtc = now;
        state.RoundStartsAtUtc = now + RetroRushCountdownMs;
        state.ActiveQuestion = null;
        state.CollectedPickupIds.Clear();
        state.ActiveRockets.Clear();
        foreach (var player in state.Players.Values)
        {
            player.X = RetroRushSpawnX;
            player.Y = RetroRushSpawnY;
            player.VelocityX = 0;
            player.VelocityY = 0;
            player.Facing = "right";
            player.MovementState = player.Connected ? "ACTIVE" : "DISCONNECTED";
            player.AnimationState = "idle";
            player.Sequence = 0;
            player.ClientTimestamp = 0;
            player.LastShoveAtUtc = 0;
            player.LastShoveSequence = 0;
            player.RocketReadyAtUtc = 0;
            player.SpeedReadyAtUtc = 0;
            player.AskReadyAtUtc = 0;
            player.AskSelectionExpiresAtUtc = 0;
            player.OwnedAbilityIds.Clear();
        }
    }

    private void SetRetroRushPlayerConnected(GameRoom room, string playerId, bool connected)
    {
        var state = room.CurrentGameSession?.RetroRush;
        if (state is null || !state.Players.TryGetValue(playerId, out var player)) return;
        player.Connected = connected;
        if (connected)
        {
            player.MovementState = player.StateBeforeDisconnect == "DISCONNECTED" ? "ACTIVE" : player.StateBeforeDisconnect;
            player.StateBeforeDisconnect = player.MovementState;
        }
        else
        {
            player.StateBeforeDisconnect = player.MovementState;
            player.MovementState = "DISCONNECTED";
            player.AnimationState = "idle";
        }
    }

    private static void RemoveRetroRushPlayer(GameRoom room, string playerId) =>
        room.CurrentGameSession?.RetroRush?.Players.Remove(playerId);

    private void RefreshRetroRushPhase(RetroRushState state)
    {
        var now = timeProvider.GetUtcNow().ToUnixTimeMilliseconds();
        if (state.Phase == "COUNTDOWN" && now >= state.RoundStartsAtUtc)
        {
            state.Phase = "RUNNING";
            state.PhaseStartedAtUtc = state.RoundStartsAtUtc;
        }
        foreach (var rocketId in state.ActiveRockets.Values
                     .Where(rocket => now - rocket.SpawnedAtUtc >= RetroRushRocketLifetimeMs)
                     .Select(rocket => rocket.RocketId).ToArray())
            state.ActiveRockets.Remove(rocketId);
    }

    private static RetroRushState RequireRetroRush(GameRoom room, string gameSessionId, int? roundId = null)
    {
        var session = room.CurrentGameSession;
        if (room.Status != RoomPhase.Playing || session?.GameId != "retro-rush" || session.Id != gameSessionId)
            throw new RoomException("WRONG_GAME_SESSION");
        var state = session.RetroRush ?? throw new RoomException("RETRO_RUSH_NOT_INITIALIZED");
        if (roundId is not null && state.RoundId != roundId) throw new RoomException("WRONG_ROUND");
        return state;
    }

    private static RetroRushPlayerState RequirePlayer(RetroRushState state, string playerId) =>
        state.Players.TryGetValue(playerId, out var player) ? player : throw new RoomException("PLAYER_NOT_IN_SESSION");

    private static bool IsActive(RetroRushPlayerState player) =>
        player.Connected && player.MovementState is "ACTIVE" or "INVULNERABLE";

    private static bool Finite(params double[] values) => values.All(double.IsFinite);
    private static double DistanceSquared(RetroRushPlayerState left, RetroRushPlayerState right) =>
        Math.Pow(right.X - left.X, 2) + Math.Pow(right.Y - left.Y, 2);

    private static RetroRushGameSnapshot Snapshot(RetroRushState state) => new(
        state.GameSessionId, state.RoundId, state.MapSeed, state.Phase, state.PhaseStartedAtUtc,
        state.RoundStartsAtUtc, state.Players.Values.OrderBy(player => player.Slot)
            .Select(player => Snapshot(player, state.RoundId)).ToArray(),
        state.CollectedPickupIds.Order(StringComparer.Ordinal).ToArray(),
        state.ActiveRockets.Values.Select(Snapshot).ToArray(), state.ActiveQuestion);

    private static RetroRushPlayerSnapshot Snapshot(RetroRushPlayerState player, int roundId) => new(
        player.PlayerId, player.DisplayName, player.Color, player.Slot, player.SkinIndex, player.Connected,
        player.X, player.Y, player.VelocityX, player.VelocityY, player.Facing, player.MovementState,
        player.AnimationState, player.Sequence, player.ClientTimestamp, roundId,
        player.OwnedAbilityIds.Order(StringComparer.Ordinal).ToArray());

    private static RetroRushRocketSnapshot Snapshot(RetroRushRocketState rocket) => new(
        rocket.RocketId, rocket.OwnerPlayerId, rocket.TargetPlayerId, rocket.X, rocket.Y,
        rocket.SpawnedAtUtc, rocket.RoundId);

    private static RetroRushPlayerState NewPlayer(RoomPlayer player, int slot) => new(
        player.Id, player.DisplayName, player.Color, slot, slot % 4, player.ConnectionId is not null,
        RetroRushSpawnX, RetroRushSpawnY);

    private sealed record RetroQuestionDefinition(
        string Id, string Category, string Type, string Prompt, IReadOnlyList<string>? Options, bool Required);

    private sealed class RetroRushState(
        string gameSessionId, int roundId, int mapSeed, long phaseStartedAtUtc, long roundStartsAtUtc)
    {
        public string GameSessionId { get; } = gameSessionId;
        public int RoundId { get; set; } = roundId;
        public int MapSeed { get; set; } = mapSeed;
        public string Phase { get; set; } = "COUNTDOWN";
        public long PhaseStartedAtUtc { get; set; } = phaseStartedAtUtc;
        public long RoundStartsAtUtc { get; set; } = roundStartsAtUtc;
        public Dictionary<string, RetroRushPlayerState> Players { get; } = new(StringComparer.Ordinal);
        public HashSet<string> CollectedPickupIds { get; } = new(StringComparer.Ordinal);
        public Dictionary<string, RetroRushRocketState> ActiveRockets { get; } = new(StringComparer.Ordinal);
        public RetroRushQuestionSnapshot? ActiveQuestion { get; set; }
    }

    private sealed class RetroRushPlayerState(
        string playerId, string displayName, string color, int slot, int skinIndex, bool connected,
        double x, double y)
    {
        public string PlayerId { get; } = playerId;
        public string DisplayName { get; } = displayName;
        public string Color { get; } = color;
        public int Slot { get; } = slot;
        public int SkinIndex { get; } = skinIndex;
        public bool Connected { get; set; } = connected;
        public double X { get; set; } = x;
        public double Y { get; set; } = y;
        public double VelocityX { get; set; }
        public double VelocityY { get; set; }
        public string Facing { get; set; } = "right";
        public string MovementState { get; set; } = connected ? "ACTIVE" : "DISCONNECTED";
        public string StateBeforeDisconnect { get; set; } = "ACTIVE";
        public string AnimationState { get; set; } = "idle";
        public long Sequence { get; set; }
        public long ClientTimestamp { get; set; }
        public long LastShoveAtUtc { get; set; }
        public long LastShoveSequence { get; set; }
        public long RocketReadyAtUtc { get; set; }
        public long SpeedReadyAtUtc { get; set; }
        public long AskReadyAtUtc { get; set; }
        public long AskSelectionExpiresAtUtc { get; set; }
        public HashSet<string> OwnedAbilityIds { get; } = new(StringComparer.Ordinal);
    }

    private sealed record RetroRushRocketState(
        string RocketId, string OwnerPlayerId, string TargetPlayerId, double X, double Y,
        long SpawnedAtUtc, int RoundId);
}

public sealed record RetroRushMutation<T>(string RoomCode, T? Event) where T : class;
public sealed record RetroRushShoveMutation(
    string RoomCode, RetroRushShoveCommandResult Result, RetroRushShoveApplied? Applied)
{
    public static RetroRushShoveMutation Accepted(string roomCode, RetroRushShoveApplied applied) =>
        new(roomCode, new(true), applied);

    public static RetroRushShoveMutation Rejected(string roomCode, string rejection) =>
        new(roomCode, new(false, rejection), null);
}
