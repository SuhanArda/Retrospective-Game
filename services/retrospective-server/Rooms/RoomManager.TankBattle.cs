using Retrospective.Server.Contracts;

namespace Retrospective.Server.Rooms;

public sealed partial class RoomManager
{
    private const int TankBattleBaseMapWidth = 1280;
    private const int TankBattleMediumMapWidth = 1728;
    private const int TankBattleLargeMapWidth = 2176;
    private const int TankBattleExtraLargeMapWidth = 2560;
    private const int TankBattleMapHeight = 720;
    private const int TankBattleTerrainStep = 8;
    private const double TankBattleWaterY = 650;
    private const double TankBattleSpawnEdgeInset = 140;
    private const double TankBattleTeamSpawnBandRatio = 0.34;
    private const double TankBattleSpawnSearchRadius = 96;
    private const double TankBattleMinimumSpawnGap = 112;
    private const double TankBattleMoveStep = 12;
    private const double TankBattleGravity = 360;
    private const double TankBattleCraterRadius = 44;
    private const double TankBattleDamageRadius = 72;
    private const int TankBattleFireCooldownMs = 900;
    private const int TankBattleProjectileStepMs = 40;
    private const int TankBattleResolvedProjectileRetentionMs = 2_000;
    private const double TankBattleExplosionImpulseRadius = 120;
    private const double TankBattleExplosionJumpForce = 400;
    private const double TankBattleExplosionHorizontalForce = 110;
    private const double TankBattleExplosionMaxVerticalSpeed = 280;
    private const double TankBattleExplosionMaxHorizontalSpeed = 140;
    private const double TankBattleTankPhysicsMaxStepSeconds = 0.2;

    public TankBattleGameSnapshot GetTankBattleSnapshot(string connectionId, string gameSessionId)
    {
        var (room, _) = Authorize(connectionId, hostRequired: false);
        lock (room.Gate) return Snapshot(RequireTankBattle(room, gameSessionId));
    }

    public TankBattleGameSnapshot? GetTankBattleSnapshotForRoom(string rawCode)
    {
        if (!_rooms.TryGetValue(rawCode.Trim().ToUpperInvariant(), out var room)) return null;
        lock (room.Gate) return room.CurrentGameSession?.TankBattle is { } state ? Snapshot(state) : null;
    }

    public TankBattleMutation MoveTankBattleTank(string connectionId, MoveTankBattleTankRequest request)
    {
        var (room, player) = Authorize(connectionId, hostRequired: false);
        lock (room.Gate)
        {
            var state = RequireTankBattle(room, request.GameSessionId);
            RequireRunning(state);
            if (request.Direction is not (-1 or 1)) throw new RoomException("INVALID_TANK_DIRECTION");
            var tank = RequireTank(state, player.Id);
            if (!tank.Alive) throw new RoomException("TANK_ELIMINATED");

            var candidateX = Math.Clamp(tank.X + request.Direction * TankBattleMoveStep, 36, state.MapWidth - 36);
            if (state.Players.Values.Any(other => other.PlayerId != tank.PlayerId && other.Alive
                && other.Team != tank.Team && Math.Abs(other.X - candidateX) < 30))
                candidateX = tank.X;
            tank.X = candidateX;
            if (!tank.Airborne) tank.Y = TerrainAt(state, tank.X) - 12;
            tank.Facing = request.Direction < 0 ? "LEFT" : "RIGHT";
            tank.TurretAngle = Math.Clamp(tank.TurretAngle, -35, 80);
            EliminateWaterFalls(state);
            FinishIfTeamEliminated(state, tank.Team);
            state.Revision++;
            return new(room.Code, Snapshot(state));
        }
    }

    public TankBattleMutation FireTankBattleShot(string connectionId, FireTankBattleShotRequest request)
    {
        var (room, player) = Authorize(connectionId, hostRequired: false);
        lock (room.Gate)
        {
            var state = RequireTankBattle(room, request.GameSessionId);
            RequireRunning(state);
            var owner = RequireTank(state, player.Id);
            if (!owner.Alive) throw new RoomException("TANK_ELIMINATED");
            if (request.Facing is not ("LEFT" or "RIGHT")) throw new RoomException("INVALID_TANK_FACING");
            if (!double.IsFinite(request.Angle) || request.Angle is < -35 or > 80) throw new RoomException("INVALID_SHOT_ANGLE");
            if (!double.IsFinite(request.Power) || request.Power is < 220 or > 620) throw new RoomException("INVALID_SHOT_POWER");
            var now = timeProvider.GetUtcNow().ToUnixTimeMilliseconds();
            if (now < owner.FireReadyAtUnixMs) throw new RoomException("TANK_FIRE_COOLDOWN");
            owner.FireReadyAtUnixMs = now + TankBattleFireCooldownMs;
            owner.Facing = request.Facing;
            owner.TurretAngle = request.Angle;

            var simulation = SimulateShot(state, owner, request.Angle, request.Power);
            var shotId = Guid.NewGuid().ToString("N");
            var shot = new TankBattleShotSnapshot(
                shotId, owner.PlayerId, request.Angle, request.Power,
                simulation.Launch, simulation.Velocity, TankBattleGravity,
                simulation.Path, simulation.Impact, now,
                now + simulation.FlightMilliseconds,
                "ACTIVE", simulation.ImpactType);
            state.Projectiles[shotId] = new TankBattleProjectileState(shot, owner.Team);
            state.LastShot = shot;
            state.Revision++;
            return new(room.Code, Snapshot(state));
        }
    }

    private TankBattleGameSnapshot? AdvanceTankBattleTimedState(GameRoom room, long now)
    {
        var state = room.CurrentGameSession?.TankBattle;
        if (state is null) return null;

        var stateChanged = AdvanceTankPhysics(state, now);
        foreach (var projectile in state.Projectiles.Values
                     .Where(projectile => projectile.Shot.Status == "ACTIVE" && projectile.Shot.ImpactAtUnixMs <= now)
                     .OrderBy(projectile => projectile.Shot.ImpactAtUnixMs))
        {
            var shot = projectile.Shot;
            var impacted = shot.ImpactType is "TERRAIN" or "TANK";
            if (impacted)
            {
                ApplyCrater(state, shot.Impact);
                ApplyDamage(state, projectile.OwnerTeam, shot.Impact);
                ApplyExplosionImpulse(state, shot.Impact);
                SettleGroundedTanks(state);
                EliminateWaterFalls(state);
                FinishIfTeamEliminated(state, projectile.OwnerTeam);
            }

            projectile.Shot = shot with { Status = impacted ? "IMPACTED" : "MISSED" };
            if (state.LastShot?.ShotId == shot.ShotId) state.LastShot = projectile.Shot;
            stateChanged = true;
        }

        if (stateChanged) state.Revision++;
        foreach (var shotId in state.Projectiles
                     .Where(entry => entry.Value.Shot.Status != "ACTIVE"
                         && entry.Value.Shot.ImpactAtUnixMs + TankBattleResolvedProjectileRetentionMs < now)
                     .Select(entry => entry.Key)
                     .ToArray())
            state.Projectiles.Remove(shotId);
        return stateChanged ? Snapshot(state) : null;
    }

    public TankBattleMutation CompleteTankBattleQuestion(string connectionId, CompleteTankBattleQuestionRequest request)
    {
        var (room, player) = Authorize(connectionId, hostRequired: false);
        lock (room.Gate)
        {
            var state = RequireTankBattle(room, request.GameSessionId);
            var question = state.ActiveQuestion ?? throw new RoomException("NO_ACTIVE_QUESTION");
            if (question.QuestionId != request.QuestionId) throw new RoomException("STALE_QUESTION");
            var tank = RequireTank(state, player.Id);
            if (tank.Team != question.LoserTeam) throw new RoomException("NOT_QUESTION_TEAM");
            question.AnsweredPlayerIds.Add(player.Id);
            var losingPlayers = state.Players.Values
                .Where(candidate => candidate.Team == question.LoserTeam && candidate.Connected)
                .Select(candidate => candidate.PlayerId);
            if (losingPlayers.All(question.AnsweredPlayerIds.Contains))
            {
                ResetTankBattleRound(state, timeProvider.GetUtcNow().ToUnixTimeMilliseconds());
                var session = room.CurrentGameSession!;
                session.RoundId = state.RoundNumber.ToString();
                session.Seed = state.MapSeed;
            }
            state.Revision++;
            return new(room.Code, Snapshot(state));
        }
    }

    private void InitializeTankBattle(GameRoom room, GameSession session)
    {
        var players = room.Players.Values.OrderBy(player => player.JoinedAt).ToArray();
        var now = timeProvider.GetUtcNow().ToUnixTimeMilliseconds();
        var state = new TankBattleState(session.Id, session.Seed, CalculateMapWidth(players.Length), now);
        GenerateTerrain(state);
        var redSpawns = CreateTeamSpawnPositions(state, (players.Length + 1) / 2, redTeam: true);
        var blueSpawns = CreateTeamSpawnPositions(state, players.Length / 2, redTeam: false);
        var redIndex = 0;
        var blueIndex = 0;
        for (var index = 0; index < players.Length; index++)
        {
            var roomPlayer = players[index];
            var team = index % 2 == 0 ? "RED" : "BLUE";
            var x = team == "RED"
                ? redSpawns[redIndex++]
                : blueSpawns[blueIndex++];
            state.Players[roomPlayer.Id] = new TankBattlePlayerState(
                roomPlayer.Id, roomPlayer.DisplayName, roomPlayer.Color, team,
                roomPlayer.ConnectionId is not null, x, TerrainAt(state, x) - 12);
        }
        session.TankBattle = state;
    }

    private static void GenerateTerrain(TankBattleState state)
    {
        state.TerrainHeights.Clear();
        var random = new Random(state.MapSeed);
        var seedPhase = Math.Abs(state.MapSeed % 997) / 997d * Math.PI * 2;
        for (var x = 0; x <= state.MapWidth; x += TankBattleTerrainStep)
        {
            var hills = 448
                + 60 * Math.Sin(x * 0.0088 + seedPhase)
                + 32 * Math.Sin(x * 0.0216 + 1.7 + seedPhase * 0.35)
                + 18 * Math.Sin(x * 0.0036 + seedPhase * 0.6);
            var formation = 0d;
            for (var center = TankBattleBaseMapWidth / 2d; center < state.MapWidth; center += TankBattleBaseMapWidth)
                formation -= 82 * Math.Exp(-Math.Pow((x - center) / 185, 2));
            state.TerrainHeights.Add(Math.Clamp(hills + formation + random.Next(-6, 7), 270, 560));
        }
    }

    private static TankBattleShotSimulation SimulateShot(
        TankBattleState state, TankBattlePlayerState owner, double angle, double power)
    {
        var radians = angle * Math.PI / 180;
        var direction = owner.Facing == "RIGHT" ? 1d : -1d;
        var pivotX = owner.X + direction * 2;
        var pivotY = owner.Y - 15;
        var x = pivotX + Math.Cos(radians) * 28 * direction;
        var y = pivotY - Math.Sin(radians) * 28;
        var launch = new TankBattlePoint(x, y);
        var velocityX = Math.Cos(radians) * power * direction;
        var velocityY = -Math.Sin(radians) * power;
        var path = new List<TankBattlePoint> { new(x, y) };
        var impactType = "OUT_OF_BOUNDS";
        var flightMilliseconds = 180 * TankBattleProjectileStepMs;
        var finished = false;
        for (var step = 0; step < 180; step++)
        {
            var elapsedSeconds = (step + 1) * TankBattleProjectileStepMs / 1_000d;
            x = launch.X + velocityX * elapsedSeconds;
            y = launch.Y + velocityY * elapsedSeconds
                + 0.5 * TankBattleGravity * elapsedSeconds * elapsedSeconds;
            if (step % 2 == 0) path.Add(new(x, y));
            var tankHit = step > 3 && state.Players.Values.Any(tank =>
                tank.PlayerId != owner.PlayerId && tank.Alive
                && Math.Abs(tank.X - x) <= 22
                && y >= tank.Y - 32 && y <= tank.Y + 12);
            if (y >= TankBattleWaterY + 24)
            {
                impactType = "WATER";
                finished = true;
            }
            else if (x <= 0 || x >= state.MapWidth)
            {
                impactType = "OUT_OF_BOUNDS";
                finished = true;
            }
            else if (tankHit)
            {
                impactType = "TANK";
                finished = true;
            }
            else if (step > 3 && y >= TerrainAt(state, x))
            {
                impactType = "TERRAIN";
                finished = true;
            }
            if (finished)
            {
                flightMilliseconds = (step + 1) * TankBattleProjectileStepMs;
                path.Add(new(Math.Clamp(x, 0, state.MapWidth), Math.Min(y, TankBattleWaterY + 24)));
                break;
            }
        }
        return new(
            launch,
            new TankBattlePoint(velocityX, velocityY),
            path,
            path[^1],
            flightMilliseconds,
            impactType);
    }

    private static void ApplyCrater(TankBattleState state, TankBattlePoint impact)
    {
        if (impact.Y >= TankBattleWaterY) return;
        for (var index = 0; index < state.TerrainHeights.Count; index++)
        {
            var x = index * TankBattleTerrainStep;
            var distance = Math.Abs(x - impact.X);
            if (distance > TankBattleCraterRadius) continue;
            var depth = Math.Sqrt(TankBattleCraterRadius * TankBattleCraterRadius - distance * distance) * 0.72;
            state.TerrainHeights[index] = Math.Min(TankBattleWaterY + 12, state.TerrainHeights[index] + depth);
        }
    }

    private static void ApplyDamage(TankBattleState state, string ownerTeam, TankBattlePoint impact)
    {
        foreach (var tank in state.Players.Values.Where(tank => tank.Alive && tank.Team != ownerTeam))
        {
            var distance = Math.Sqrt(Math.Pow(tank.X - impact.X, 2) + Math.Pow(tank.Y - impact.Y, 2));
            if (distance > TankBattleDamageRadius) continue;
            tank.Health--;
            if (tank.Health <= 0)
            {
                tank.Alive = false;
                tank.VelocityX = 0;
                tank.VelocityY = 0;
                tank.Airborne = false;
            }
        }
    }

    private static void ApplyExplosionImpulse(TankBattleState state, TankBattlePoint impact)
    {
        foreach (var tank in state.Players.Values.Where(tank => tank.Alive))
        {
            var deltaX = tank.X - impact.X;
            var deltaY = tank.Y - impact.Y;
            var distance = Math.Sqrt(deltaX * deltaX + deltaY * deltaY);
            if (distance >= TankBattleExplosionImpulseRadius) continue;

            var proximity = 1 - distance / TankBattleExplosionImpulseRadius;
            var horizontalDirection = Math.Abs(deltaX) < 0.001 ? 0 : Math.Sign(deltaX);
            var belowTankMultiplier = impact.Y >= tank.Y - 8 ? 1 : 0.35;
            tank.VelocityX = Math.Clamp(
                tank.VelocityX + horizontalDirection * TankBattleExplosionHorizontalForce * proximity,
                -TankBattleExplosionMaxHorizontalSpeed,
                TankBattleExplosionMaxHorizontalSpeed);
            tank.VelocityY = Math.Max(
                tank.VelocityY - TankBattleExplosionJumpForce * proximity * belowTankMultiplier,
                -TankBattleExplosionMaxVerticalSpeed);
            tank.Airborne = true;
        }
    }

    private static bool AdvanceTankPhysics(TankBattleState state, long now)
    {
        var elapsedSeconds = Math.Clamp(
            (now - state.LastPhysicsAtUnixMs) / 1_000d,
            0,
            TankBattleTankPhysicsMaxStepSeconds);
        state.LastPhysicsAtUnixMs = now;
        if (elapsedSeconds <= 0) return false;

        var changed = false;
        foreach (var tank in state.Players.Values.Where(tank => tank.Alive && tank.Airborne))
        {
            tank.VelocityY += TankBattleGravity * elapsedSeconds;
            var nextX = Math.Clamp(tank.X + tank.VelocityX * elapsedSeconds, 36, state.MapWidth - 36);
            if (nextX is <= 36 || nextX >= state.MapWidth - 36) tank.VelocityX = 0;
            var nextY = tank.Y + tank.VelocityY * elapsedSeconds;
            var groundY = TerrainAt(state, nextX) - 12;
            tank.X = nextX;
            if (nextY >= groundY && tank.VelocityY >= 0)
            {
                tank.Y = groundY;
                tank.VelocityX = 0;
                tank.VelocityY = 0;
                tank.Airborne = false;
            }
            else
            {
                tank.Y = nextY;
                tank.VelocityX *= Math.Pow(0.92, elapsedSeconds);
            }
            changed = true;
        }
        if (changed)
        {
            EliminateWaterFalls(state);
            FinishIfTeamEliminated(state, state.Players.Values.FirstOrDefault()?.Team ?? "RED");
        }
        return changed;
    }

    private static void SettleGroundedTanks(TankBattleState state)
    {
        foreach (var tank in state.Players.Values.Where(tank => tank.Alive && !tank.Airborne))
            tank.Y = TerrainAt(state, tank.X) - 12;
    }

    private static void EliminateWaterFalls(TankBattleState state)
    {
        foreach (var tank in state.Players.Values.Where(tank => tank.Alive && tank.Y + 12 >= TankBattleWaterY - 2))
        {
            tank.Health = 0;
            tank.Alive = false;
            tank.VelocityX = 0;
            tank.VelocityY = 0;
            tank.Airborne = false;
        }
    }

    private static void FinishIfTeamEliminated(TankBattleState state, string actingTeam)
    {
        if (state.Phase != "RUNNING") return;
        var redAlive = state.Players.Values.Any(player => player.Team == "RED" && player.Alive);
        var blueAlive = state.Players.Values.Any(player => player.Team == "BLUE" && player.Alive);
        if (redAlive && blueAlive) return;
        var winner = redAlive ? "RED" : blueAlive ? "BLUE" : actingTeam;
        var loser = winner == "RED" ? "BLUE" : "RED";
        state.Result = new TankBattleResultSnapshot(
            winner, loser,
            state.Players.Values.Where(player => player.Alive).Select(player => player.PlayerId).ToArray(),
            state.Players.Values.Where(player => !player.Alive).Select(player => player.PlayerId).ToArray());
        state.Phase = "QUESTION";
        state.ActiveQuestion = new TankBattleQuestionState(
            $"tank-battle:{state.RoundNumber}:{state.MapSeed}:{state.Revision + 1}", Math.Abs(state.MapSeed % 20), loser);
    }

    private static void ResetTankBattleRound(TankBattleState state, long now)
    {
        state.RoundNumber++;
        state.MapSeed = (int)((state.MapSeed * 1_664_525L + 1_013_904_223L) & int.MaxValue);
        state.Phase = "RUNNING";
        state.LastShot = null;
        state.Result = null;
        state.ActiveQuestion = null;
        state.Projectiles.Clear();
        GenerateTerrain(state);

        var redPlayers = state.Players.Values.Where(player => player.Team == "RED").OrderBy(player => player.X).ToArray();
        var bluePlayers = state.Players.Values.Where(player => player.Team == "BLUE").OrderByDescending(player => player.X).ToArray();
        var redSpawns = CreateTeamSpawnPositions(state, redPlayers.Length, redTeam: true);
        var blueSpawns = CreateTeamSpawnPositions(state, bluePlayers.Length, redTeam: false);
        for (var index = 0; index < redPlayers.Length; index++)
            ResetTank(redPlayers[index], redSpawns[index], "RIGHT", state);
        for (var index = 0; index < bluePlayers.Length; index++)
            ResetTank(bluePlayers[index], blueSpawns[index], "LEFT", state);
        state.LastPhysicsAtUnixMs = now;
    }

    private static void ResetTank(TankBattlePlayerState player, double x, string facing, TankBattleState state)
    {
        player.X = x;
        player.Y = TerrainAt(state, x) - 12;
        player.Health = 3;
        player.Alive = true;
        player.Facing = facing;
        player.TurretAngle = 42;
        player.FireReadyAtUnixMs = 0;
        player.VelocityX = 0;
        player.VelocityY = 0;
        player.Airborne = false;
    }

    private static int CalculateMapWidth(int playerCount) => playerCount switch
    {
        <= 4 => TankBattleBaseMapWidth,
        <= 6 => TankBattleMediumMapWidth,
        <= 8 => TankBattleLargeMapWidth,
        _ => TankBattleExtraLargeMapWidth,
    };

    private static double[] CreateTeamSpawnPositions(TankBattleState state, int playerCount, bool redTeam)
    {
        if (playerCount == 0) return [];
        var bandStart = TankBattleSpawnEdgeInset;
        var bandEnd = state.MapWidth * TankBattleTeamSpawnBandRatio;
        var spacing = playerCount == 1 ? 0 : (bandEnd - bandStart) / (playerCount - 1);
        spacing = Math.Max(spacing, TankBattleMinimumSpawnGap);
        var occupied = new List<double>(playerCount);
        for (var index = 0; index < playerCount; index++)
        {
            var leftTarget = Math.Min(bandEnd, bandStart + index * spacing);
            var target = redTeam ? leftTarget : state.MapWidth - leftTarget;
            occupied.Add(FindStableSpawnX(state, target, redTeam, occupied));
        }
        return occupied.ToArray();
    }

    private static double FindStableSpawnX(
        TankBattleState state,
        double target,
        bool redTeam,
        IReadOnlyCollection<double> occupied)
    {
        var sideMinimum = redTeam ? TankBattleSpawnEdgeInset : state.MapWidth * (1 - TankBattleTeamSpawnBandRatio);
        var sideMaximum = redTeam ? state.MapWidth * TankBattleTeamSpawnBandRatio : state.MapWidth - TankBattleSpawnEdgeInset;
        var bestX = Math.Clamp(target, sideMinimum, sideMaximum);
        var bestScore = double.PositiveInfinity;
        for (var offset = -TankBattleSpawnSearchRadius; offset <= TankBattleSpawnSearchRadius; offset += TankBattleTerrainStep)
        {
            var candidate = Math.Clamp(target + offset, sideMinimum, sideMaximum);
            var surface = TerrainAt(state, candidate);
            var slope = Math.Abs(TerrainAt(state, candidate + 20) - TerrainAt(state, candidate - 20));
            var crowded = occupied.Any(existing => Math.Abs(existing - candidate) < TankBattleMinimumSpawnGap);
            if (surface >= TankBattleWaterY - 32 || crowded) continue;
            var score = slope + Math.Abs(offset) * 0.025;
            if (score >= bestScore) continue;
            bestScore = score;
            bestX = candidate;
        }
        return bestX;
    }

    private static double TerrainAt(TankBattleState state, double x)
    {
        var clamped = Math.Clamp(x / TankBattleTerrainStep, 0, state.TerrainHeights.Count - 1);
        var left = (int)Math.Floor(clamped);
        var right = Math.Min(left + 1, state.TerrainHeights.Count - 1);
        var amount = clamped - left;
        return state.TerrainHeights[left] + (state.TerrainHeights[right] - state.TerrainHeights[left]) * amount;
    }

    private static TankBattleState RequireTankBattle(GameRoom room, string gameSessionId)
    {
        var session = room.CurrentGameSession ?? throw new RoomException("NO_ACTIVE_GAME_SESSION");
        if (session.GameId != "tank-battle" || session.Id != gameSessionId) throw new RoomException("WRONG_GAME_SESSION");
        return session.TankBattle ?? throw new RoomException("TANK_BATTLE_NOT_INITIALIZED");
    }

    private static TankBattlePlayerState RequireTank(TankBattleState state, string playerId) =>
        state.Players.GetValueOrDefault(playerId) ?? throw new RoomException("PLAYER_NOT_IN_TANK_BATTLE");

    private static void RequireRunning(TankBattleState state)
    {
        if (state.Phase != "RUNNING") throw new RoomException("TANK_BATTLE_NOT_RUNNING");
    }

    private TankBattleGameSnapshot Snapshot(TankBattleState state) => new(
        state.GameSessionId, state.RoundNumber, state.Revision,
        timeProvider.GetUtcNow().ToUnixTimeMilliseconds(), state.Phase, state.MapSeed,
        state.MapWidth, TankBattleMapHeight, TankBattleWaterY, TankBattleTerrainStep,
        state.TerrainHeights.ToArray(),
        state.Players.Values.OrderBy(player => player.Team).ThenBy(player => player.X).Select(player => new TankBattlePlayerSnapshot(
            player.PlayerId, player.DisplayName, player.Color, player.Team, player.Connected,
            player.X, player.Y, player.Health, player.Alive, player.Facing, player.TurretAngle,
            player.VelocityX, player.VelocityY, player.Airborne)).ToArray(),
        state.Projectiles.Values.Select(projectile => projectile.Shot).OrderBy(shot => shot.FiredAtUnixMs).ToArray(),
        state.LastShot, state.Result,
        state.ActiveQuestion is null ? null : new TankBattleQuestionSnapshot(
            state.ActiveQuestion.QuestionId, state.ActiveQuestion.QuestionIndex, state.ActiveQuestion.LoserTeam,
            state.ActiveQuestion.AnsweredPlayerIds.Order(StringComparer.Ordinal).ToArray()));

    private static void SetTankBattlePlayerConnected(GameRoom room, string playerId, bool connected)
    {
        if (room.CurrentGameSession?.TankBattle?.Players.GetValueOrDefault(playerId) is { } player) player.Connected = connected;
    }

    private static void RemoveTankBattlePlayer(GameRoom room, string playerId)
    {
        var state = room.CurrentGameSession?.TankBattle;
        if (state is null || !state.Players.Remove(playerId, out var removed)) return;
        FinishIfTeamEliminated(state, removed.Team);
        state.Revision++;
    }

    private sealed class TankBattleState(string gameSessionId, int mapSeed, int mapWidth, long startedAtUnixMs)
    {
        public string GameSessionId { get; } = gameSessionId;
        public int MapSeed { get; set; } = mapSeed;
        public int MapWidth { get; } = mapWidth;
        public int RoundNumber { get; set; } = 1;
        public long StartedAtUnixMs { get; } = startedAtUnixMs;
        public long LastPhysicsAtUnixMs { get; set; } = startedAtUnixMs;
        public int Revision { get; set; } = 1;
        public string Phase { get; set; } = "RUNNING";
        public List<double> TerrainHeights { get; } = [];
        public Dictionary<string, TankBattlePlayerState> Players { get; } = new(StringComparer.Ordinal);
        public Dictionary<string, TankBattleProjectileState> Projectiles { get; } = new(StringComparer.Ordinal);
        public TankBattleShotSnapshot? LastShot { get; set; }
        public TankBattleResultSnapshot? Result { get; set; }
        public TankBattleQuestionState? ActiveQuestion { get; set; }
    }

    private sealed class TankBattlePlayerState(
        string playerId, string displayName, string color, string team, bool connected, double x, double y)
    {
        public string PlayerId { get; } = playerId;
        public string DisplayName { get; } = displayName;
        public string Color { get; } = color;
        public string Team { get; } = team;
        public bool Connected { get; set; } = connected;
        public double X { get; set; } = x;
        public double Y { get; set; } = y;
        public int Health { get; set; } = 3;
        public bool Alive { get; set; } = true;
        public string Facing { get; set; } = team == "RED" ? "RIGHT" : "LEFT";
        public double TurretAngle { get; set; } = 42;
        public long FireReadyAtUnixMs { get; set; }
        public double VelocityX { get; set; }
        public double VelocityY { get; set; }
        public bool Airborne { get; set; }
    }

    private sealed class TankBattleQuestionState(string questionId, int questionIndex, string loserTeam)
    {
        public string QuestionId { get; } = questionId;
        public int QuestionIndex { get; } = questionIndex;
        public string LoserTeam { get; } = loserTeam;
        public HashSet<string> AnsweredPlayerIds { get; } = new(StringComparer.Ordinal);
    }

    private sealed class TankBattleProjectileState(TankBattleShotSnapshot shot, string ownerTeam)
    {
        public TankBattleShotSnapshot Shot { get; set; } = shot;
        public string OwnerTeam { get; } = ownerTeam;
    }

    private sealed record TankBattleShotSimulation(
        TankBattlePoint Launch,
        TankBattlePoint Velocity,
        IReadOnlyList<TankBattlePoint> Path,
        TankBattlePoint Impact,
        int FlightMilliseconds,
        string ImpactType);
}

public sealed record TankBattleMutation(string RoomCode, TankBattleGameSnapshot Snapshot);
