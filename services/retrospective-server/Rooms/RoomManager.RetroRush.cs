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
    private const int RetroRushRoundDurationMs = 180_000;
    private const int RetroRushResultsDurationMs = 4_000;
    private const int RetroRushInitialAbilityLockMs = 7_000;
    private const int RetroRushSpeedCooldownMs = 8_000;
    private const int RetroRushPullLeaderCooldownMs = 12_000;
    private const double RetroRushPullLeaderVelocityX = -550;
    private const int RetroRushPullLeaderHitStunMs = 300;
    private const int RetroRushQuestionPoolSize = 20;
    private static readonly HashSet<string> MovementStates =
        ["ACTIVE", "INVULNERABLE"];
    private static readonly HashSet<string> AnimationStates =
        ["idle", "running", "jumping", "falling", "hit", "eliminated"];
    private static readonly HashSet<string> AbilityIds = ["speed", "rocket", "pull"];
    private static readonly HashSet<string> ControlledShoveRejections =
        ["WRONG_GAME_SESSION", "WRONG_ROUND", "PLAYER_NOT_IN_SESSION", "SELF_SHOVE", "PLAYER_NOT_ACTIVE", "ROUND_NOT_STARTED", "SHOVE_COOLDOWN", "SHOVE_OUT_OF_RANGE"];
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
            RequireRetroRushRoundStarted(state);
            if (authenticated.Id != request.PlayerId) throw new RoomException("PLAYER_ID_MISMATCH");
            if (!Finite(request.X, request.Y, request.VelocityX, request.VelocityY) ||
                Math.Abs(request.X) > 1_000_000 || Math.Abs(request.Y) > 1_000_000)
                throw new RoomException("INVALID_PLAYER_SNAPSHOT");
            if (request.Facing is not ("left" or "right") ||
                !MovementStates.Contains(request.MovementState) || !AnimationStates.Contains(request.AnimationState))
                throw new RoomException("INVALID_PLAYER_SNAPSHOT");
            var player = RequirePlayer(state, authenticated.Id);
            if (request.Sequence <= player.Sequence) return new(room.Code, null);
            if (state.Phase != "RUNNING" || !IsActive(player)) return new(room.Code, null);
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
                RequireRetroRushRoundStarted(state);
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

    public RetroRushRocketFireMutation RequestRetroRushRocketFire(
        string connectionId, RequestRetroRushRocketFireRequest request)
    {
        var (room, authenticated) = Authorize(connectionId, hostRequired: false);
        lock (room.Gate)
        {
            var state = RequireRetroRush(room, request.GameSessionId, request.RoundId);
            RefreshRetroRushPhase(state);
            RequireRetroRushRoundStarted(state);
            var owner = RequirePlayer(state, authenticated.Id);
            if (state.Phase != "RUNNING" || !IsActive(owner)) throw new RoomException("PLAYER_NOT_ACTIVE");
            var now = timeProvider.GetUtcNow().ToUnixTimeMilliseconds();
            RequireRetroRushAbilitiesUnlocked(state, now);
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
            return new(room.Code, Snapshot(rocket), new RetroRushAbilityApplied(
                state.RoundId, "rocket", owner.PlayerId, target.PlayerId, null, null, owner.RocketReadyAtUtc));
        }
    }

    public RetroRushMutation<RetroRushRocketHitApplied> RequestRetroRushRocketHit(
        string connectionId, RequestRetroRushRocketHitRequest request)
    {
        var (room, authenticated) = Authorize(connectionId, hostRequired: false);
        lock (room.Gate)
        {
            var state = RequireRetroRush(room, request.GameSessionId, request.RoundId);
            RefreshRetroRushPhase(state);
            RequireRetroRushRoundStarted(state);
            if (state.Phase != "RUNNING") throw new RoomException("PLAYER_NOT_ACTIVE");
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

    public RetroRushMutation<RetroRushPlayerEliminated> RequestRetroRushPlayerElimination(
        string connectionId, RequestRetroRushPlayerEliminationRequest request)
    {
        var (room, authenticated) = Authorize(connectionId, hostRequired: false);
        lock (room.Gate)
        {
            var state = RequireRetroRush(room, request.GameSessionId, request.RoundId);
            RefreshRetroRushPhase(state);
            RequireRetroRushRoundStarted(state);
            if (authenticated.Id != request.PlayerId) throw new RoomException("PLAYER_ID_MISMATCH");
            var player = RequirePlayer(state, authenticated.Id);
            if (!IsActive(player)) return new(room.Code, null);
            if (state.Phase != "RUNNING") throw new RoomException("INVALID_RETRO_RUSH_PHASE");
            var now = timeProvider.GetUtcNow().ToUnixTimeMilliseconds();
            var order = state.EliminationOrder.Count + 1;
            player.EliminatedAtUnixMs = now;
            player.EliminationOrder = order;
            player.MovementState = "FINISHED";
            player.StateBeforeDisconnect = "FINISHED";
            player.AnimationState = "eliminated";
            player.VelocityX = 0;
            player.VelocityY = 0;
            state.EliminationOrder.Add(new(player.PlayerId, now, order));
            if (state.Players.Values.Count(candidate => candidate.EliminatedAtUnixMs is null) <= 1)
                FinishRetroRushRound(state, now);
            return new(room.Code, new RetroRushPlayerEliminated(state.RoundId, player.PlayerId, now, order));
        }
    }

    public RetroRushMutation<RetroRushAbilityApplied> UseRetroRushAbility(
        string connectionId, UseRetroRushAbilityRequest request)
    {
        var (room, authenticated) = Authorize(connectionId, hostRequired: false);
        lock (room.Gate)
        {
            var state = RequireRetroRush(room, request.GameSessionId, request.RoundId);
            RefreshRetroRushPhase(state);
            RequireRetroRushRoundStarted(state);
            var player = RequirePlayer(state, authenticated.Id);
            if (state.Phase != "RUNNING" || !IsActive(player)) throw new RoomException("PLAYER_NOT_ACTIVE");
            if (!AbilityIds.Contains(request.AbilityId)) throw new RoomException("INVALID_ABILITY");
            var now = timeProvider.GetUtcNow().ToUnixTimeMilliseconds();
            RequireRetroRushAbilitiesUnlocked(state, now);
            if (request.AbilityId == "speed")
            {
                if (now < player.SpeedReadyAtUtc) throw new RoomException("SPEED_COOLDOWN");
                player.SpeedReadyAtUtc = now + RetroRushSpeedCooldownMs;
                return new(room.Code, new RetroRushAbilityApplied(
                    state.RoundId, "speed", player.PlayerId, null, null, null, player.SpeedReadyAtUtc));
            }
            if (request.AbilityId == "pull")
            {
                if (now < player.PullLeaderReadyAtUtc) throw new RoomException("PULL_LEADER_COOLDOWN");
                var target = state.Players.Values
                    .Where(candidate => candidate.PlayerId != player.PlayerId && IsActive(candidate) && candidate.X > player.X)
                    .OrderByDescending(candidate => candidate.X)
                    .ThenBy(candidate => candidate.PlayerId, StringComparer.Ordinal)
                    .FirstOrDefault() ?? throw new RoomException("NO_PLAYER_AHEAD");
                player.PullLeaderReadyAtUtc = now + RetroRushPullLeaderCooldownMs;
                target.VelocityX = RetroRushPullLeaderVelocityX;
                return new(room.Code, new RetroRushAbilityApplied(
                    state.RoundId, "pull", player.PlayerId, target.PlayerId,
                    RetroRushPullLeaderVelocityX, RetroRushPullLeaderHitStunMs, player.PullLeaderReadyAtUtc));
            }
            throw new RoomException("INVALID_ABILITY");
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
        var state = new RetroRushState(
            session.Id, 1, session.Seed, now, now + RetroRushCountdownMs,
            RetroRushSpawnX, RetroRushSpawnY);
        var abilityUnlockAt = state.RoundStartAtUnixMs + RetroRushInitialAbilityLockMs;
        foreach (var entry in room.Players.Values.OrderBy(player => player.JoinedAt).Select((player, slot) => (player, slot)))
            state.Players[entry.player.Id] = NewPlayer(
                entry.player, entry.slot, state.SpawnX, state.SpawnY, abilityUnlockAt);
        session.RetroRush = state;
    }

    private void ResetRetroRushRound(RetroRushState state)
    {
        var now = timeProvider.GetUtcNow().ToUnixTimeMilliseconds();
        state.Phase = "COUNTDOWN";
        state.PhaseStartedAtUtc = now;
        state.RoundStartAtUnixMs = now + RetroRushCountdownMs;
        state.RoundDeadlineAtUnixMs = state.RoundStartAtUnixMs + RetroRushRoundDurationMs;
        state.ResultsEndAtUnixMs = 0;
        state.ActiveQuestion = null;
        state.EliminationOrder.Clear();
        state.Ranking.Clear();
        state.LastPlacePlayerId = null;
        state.ActiveRockets.Clear();
        var abilityUnlockAt = state.RoundStartAtUnixMs + RetroRushInitialAbilityLockMs;
        foreach (var player in state.Players.Values)
        {
            player.X = state.SpawnX;
            player.Y = state.SpawnY;
            player.VelocityX = 0;
            player.VelocityY = 0;
            player.Facing = "right";
            player.MovementState = player.Connected ? "ACTIVE" : "DISCONNECTED";
            player.AnimationState = "idle";
            player.Sequence = 0;
            player.ClientTimestamp = 0;
            player.LastShoveAtUtc = 0;
            player.LastShoveSequence = 0;
            player.RocketReadyAtUtc = abilityUnlockAt;
            player.SpeedReadyAtUtc = abilityUnlockAt;
            player.PullLeaderReadyAtUtc = abilityUnlockAt;
            player.EliminatedAtUnixMs = null;
            player.EliminationOrder = null;
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
        if (state.Phase == "COUNTDOWN" && now >= state.RoundStartAtUnixMs)
        {
            state.Phase = "RUNNING";
            state.PhaseStartedAtUtc = state.RoundStartAtUnixMs;
            state.Revision++;
        }
        if (state.Phase == "RUNNING" && now >= state.RoundDeadlineAtUnixMs)
            FinishRetroRushRound(state, now);
        if (state.Phase == "RESULTS" && now >= state.ResultsEndAtUnixMs)
            OpenRetroRushQuestion(state, state.ResultsEndAtUnixMs);
        foreach (var rocketId in state.ActiveRockets.Values
                     .Where(rocket => now - rocket.SpawnedAtUtc >= RetroRushRocketLifetimeMs)
                     .Select(rocket => rocket.RocketId).ToArray())
            state.ActiveRockets.Remove(rocketId);
    }

    private RetroRushGameSnapshot? AdvanceRetroRushTimedState(GameRoom room)
    {
        var state = room.CurrentGameSession?.RetroRush;
        if (state is null) return null;
        RefreshRetroRushPhase(state);
        if (state.BroadcastRevision == state.Revision) return null;
        state.BroadcastRevision = state.Revision;
        return Snapshot(state);
    }

    private void FinishRetroRushRound(RetroRushState state, long finishedAtUnixMs)
    {
        if (state.Phase != "RUNNING") return;
        var ordered = state.Players.Values
            .Where(player => player.EliminatedAtUnixMs is null)
            .OrderByDescending(player => player.X)
            .ThenBy(player => player.PlayerId, StringComparer.Ordinal)
            .Concat(state.Players.Values
                .Where(player => player.EliminatedAtUnixMs is not null)
                .OrderByDescending(player => player.EliminationOrder)
                .ThenBy(player => player.PlayerId, StringComparer.Ordinal))
            .ToArray();
        state.Ranking.Clear();
        state.Ranking.AddRange(ordered.Select((player, index) => new RetroRushRankingEntry(
            player.PlayerId, player.DisplayName, player.Color, index + 1, player.X,
            player.EliminatedAtUnixMs is not null, player.EliminatedAtUnixMs)));
        state.LastPlacePlayerId = state.Ranking.LastOrDefault()?.PlayerId;
        state.Phase = "RESULTS";
        state.PhaseStartedAtUtc = finishedAtUnixMs;
        state.ResultsEndAtUnixMs = finishedAtUnixMs + RetroRushResultsDurationMs;
        state.ActiveQuestion = null;
        state.ActiveRockets.Clear();
        foreach (var player in state.Players.Values)
        {
            player.VelocityX = 0;
            player.VelocityY = 0;
            player.MovementState = "FINISHED";
            player.StateBeforeDisconnect = "FINISHED";
            if (player.EliminatedAtUnixMs is null) player.AnimationState = "idle";
        }
        state.Revision++;
    }

    private void OpenRetroRushQuestion(RetroRushState state, long openedAtUnixMs)
    {
        if (state.Phase != "RESULTS" || state.LastPlacePlayerId is null) return;
        var definition = RetroRushQuestions[(state.RoundId - 1) % RetroRushQuestions.Length];
        var questionIndex = (state.RoundId - 1) % RetroRushQuestionPoolSize;
        state.ActiveQuestion = new RetroRushQuestionSnapshot(
            definition.Id, questionIndex, state.LastPlacePlayerId, "ACTIVE", state.RoundId,
            definition.Category, definition.Type, definition.Prompt, definition.Options, definition.Required);
        state.Phase = "QUESTION";
        state.PhaseStartedAtUtc = openedAtUnixMs;
        if (state.Players.TryGetValue(state.LastPlacePlayerId, out var owner))
        {
            owner.MovementState = "ANSWERING_QUESTION";
            owner.StateBeforeDisconnect = "ANSWERING_QUESTION";
        }
        state.Revision++;
    }

    private void RequireRetroRushRoundStarted(RetroRushState state)
    {
        if (timeProvider.GetUtcNow().ToUnixTimeMilliseconds() < state.RoundStartAtUnixMs)
            throw new RoomException("ROUND_NOT_STARTED");
    }

    private static void RequireRetroRushAbilitiesUnlocked(RetroRushState state, long now)
    {
        if (now < state.RoundStartAtUnixMs + RetroRushInitialAbilityLockMs)
            throw new RoomException("ABILITY_INITIAL_LOCK");
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
        state.RoundStartAtUnixMs, state.RoundDeadlineAtUnixMs, state.ResultsEndAtUnixMs, state.SpawnX, state.SpawnY,
        state.Players.Values.OrderBy(player => player.Slot)
            .Select(player => Snapshot(player, state.RoundId)).ToArray(),
        state.ActiveRockets.Values.Select(Snapshot).ToArray(), state.EliminationOrder.ToArray(),
        state.Ranking.ToArray(), state.LastPlacePlayerId, state.ActiveQuestion);

    private static RetroRushPlayerSnapshot Snapshot(RetroRushPlayerState player, int roundId) => new(
        player.PlayerId, player.DisplayName, player.Color, player.Slot, player.SkinIndex, player.Connected,
        player.X, player.Y, player.VelocityX, player.VelocityY, player.Facing, player.MovementState,
        player.AnimationState, player.Sequence, player.ClientTimestamp, roundId,
        player.SpeedReadyAtUtc, player.RocketReadyAtUtc, player.PullLeaderReadyAtUtc);

    private static RetroRushRocketSnapshot Snapshot(RetroRushRocketState rocket) => new(
        rocket.RocketId, rocket.OwnerPlayerId, rocket.TargetPlayerId, rocket.X, rocket.Y,
        rocket.SpawnedAtUtc, rocket.RoundId);

    private static RetroRushPlayerState NewPlayer(
        RoomPlayer player, int slot, double spawnX, double spawnY, long abilityUnlockAt) => new(
        player.Id, player.DisplayName, player.Color, slot, slot % 4, player.ConnectionId is not null,
        spawnX, spawnY)
    {
        SpeedReadyAtUtc = abilityUnlockAt,
        RocketReadyAtUtc = abilityUnlockAt,
        PullLeaderReadyAtUtc = abilityUnlockAt,
    };

    private sealed record RetroQuestionDefinition(
        string Id, string Category, string Type, string Prompt, IReadOnlyList<string>? Options, bool Required);

    private sealed class RetroRushState(
        string gameSessionId, int roundId, int mapSeed, long phaseStartedAtUtc, long roundStartAtUnixMs,
        double spawnX, double spawnY)
    {
        public string GameSessionId { get; } = gameSessionId;
        public int RoundId { get; set; } = roundId;
        public int MapSeed { get; set; } = mapSeed;
        public string Phase { get; set; } = "COUNTDOWN";
        public long PhaseStartedAtUtc { get; set; } = phaseStartedAtUtc;
        public long RoundStartAtUnixMs { get; set; } = roundStartAtUnixMs;
        public long RoundDeadlineAtUnixMs { get; set; } = roundStartAtUnixMs + RetroRushRoundDurationMs;
        public long ResultsEndAtUnixMs { get; set; }
        public double SpawnX { get; } = spawnX;
        public double SpawnY { get; } = spawnY;
        public Dictionary<string, RetroRushPlayerState> Players { get; } = new(StringComparer.Ordinal);
        public Dictionary<string, RetroRushRocketState> ActiveRockets { get; } = new(StringComparer.Ordinal);
        public List<RetroRushEliminationSnapshot> EliminationOrder { get; } = [];
        public List<RetroRushRankingEntry> Ranking { get; } = [];
        public string? LastPlacePlayerId { get; set; }
        public RetroRushQuestionSnapshot? ActiveQuestion { get; set; }
        public long Revision { get; set; }
        public long BroadcastRevision { get; set; }
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
        public long PullLeaderReadyAtUtc { get; set; }
        public long? EliminatedAtUnixMs { get; set; }
        public int? EliminationOrder { get; set; }
    }

    private sealed record RetroRushRocketState(
        string RocketId, string OwnerPlayerId, string TargetPlayerId, double X, double Y,
        long SpawnedAtUtc, int RoundId);
}

public sealed record RetroRushMutation<T>(string RoomCode, T? Event) where T : class;
public sealed record RetroRushRocketFireMutation(
    string RoomCode, RetroRushRocketSnapshot Rocket, RetroRushAbilityApplied Ability);
public sealed record RetroRushShoveMutation(
    string RoomCode, RetroRushShoveCommandResult Result, RetroRushShoveApplied? Applied)
{
    public static RetroRushShoveMutation Accepted(string roomCode, RetroRushShoveApplied applied) =>
        new(roomCode, new(true), applied);

    public static RetroRushShoveMutation Rejected(string roomCode, string rejection) =>
        new(roomCode, new(false, rejection), null);
}
