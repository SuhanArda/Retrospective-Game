using Microsoft.Extensions.Options;
using Retrospective.Server.Contracts;
using Retrospective.Server.Rooms;

namespace Retrospective.Server.Tests;

public sealed class TankBattleRoomManagerTests
{
    [Fact]
    public void TeamsAreBalancedDeterministicAndReconnectPreservesTankState()
    {
        var game = StartGame(extraPlayerCount: 2);
        var initial = game.Manager.GetTankBattleSnapshot("host", game.SessionId);

        Assert.Equal(new[] { "RED", "BLUE", "RED", "BLUE" },
            initial.Players.OrderBy(player => PlayerOrder(game, player.PlayerId)).Select(player => player.Team));
        Assert.Equal(2, initial.Players.Count(player => player.Team == "RED"));
        Assert.Equal(2, initial.Players.Count(player => player.Team == "BLUE"));
        Assert.Equal(1280, initial.MapWidth);
        Assert.Equal(70, initial.MapHeight - initial.WaterY);
        Assert.True(initial.Players.Where(player => player.Team == "RED").Max(player => player.X)
            - initial.Players.Where(player => player.Team == "RED").Min(player => player.X) > 100);
        Assert.All(initial.Players, player => Assert.Equal(3, player.Health));

        var moved = game.Manager.MoveTankBattleTank("guest", new(game.SessionId, -1)).Snapshot;
        Assert.Equal("LEFT", moved.Players.Single(player => player.PlayerId == game.Guest.PlayerId).Facing);
        moved = game.Manager.MoveTankBattleTank("guest", new(game.SessionId, 1)).Snapshot;
        var movedGuest = moved.Players.Single(player => player.PlayerId == game.Guest.PlayerId);
        var guestX = movedGuest.X;
        Assert.Equal("RIGHT", movedGuest.Facing);
        game.Manager.Disconnect("guest");
        Assert.False(game.Manager.GetTankBattleSnapshot("host", game.SessionId).Players
            .Single(player => player.PlayerId == game.Guest.PlayerId).Connected);

        game.Manager.Attach(game.Host.RoomCode, game.Guest.PlayerId, game.Guest.ReconnectToken, "guest-reconnected");
        var reconnected = game.Manager.GetTankBattleSnapshot("guest-reconnected", game.SessionId);
        var guest = reconnected.Players.Single(player => player.PlayerId == game.Guest.PlayerId);
        Assert.True(guest.Connected);
        Assert.Equal(guestX, guest.X);
        Assert.Equal(initial.TerrainHeights, reconnected.TerrainHeights);
    }

    [Theory]
    [InlineData(0, 1280)]
    [InlineData(2, 1280)]
    [InlineData(4, 1728)]
    [InlineData(6, 2176)]
    [InlineData(8, 2560)]
    public void WorldWidthAndSafeTeamSpawnsScaleWithPlayerCount(int extraPlayerCount, int expectedWidth)
    {
        var game = StartGame(extraPlayerCount);
        var snapshot = game.Manager.GetTankBattleSnapshot("host", game.SessionId);

        Assert.Equal(expectedWidth, snapshot.MapWidth);
        Assert.Equal(expectedWidth / snapshot.TerrainStep + 1, snapshot.TerrainHeights.Count);
        Assert.All(snapshot.Players, tank =>
        {
            Assert.Equal(TerrainAt(snapshot, tank.X) - 12, tank.Y, precision: 6);
            Assert.True(tank.Y + 12 < snapshot.WaterY - 2);
            Assert.False(tank.Airborne);
        });
        Assert.True(snapshot.Players.Where(tank => tank.Team == "RED").Max(tank => tank.X) < expectedWidth * 0.45);
        Assert.True(snapshot.Players.Where(tank => tank.Team == "BLUE").Min(tank => tank.X) > expectedWidth * 0.55);
        foreach (var team in new[] { "RED", "BLUE" })
        {
            var positions = snapshot.Players.Where(tank => tank.Team == team).OrderBy(tank => tank.X).Select(tank => tank.X).ToArray();
            for (var index = 1; index < positions.Length; index++) Assert.True(
                positions[index] - positions[index - 1] >= 100,
                $"{team} spawn gap: {string.Join(", ", positions.Select(position => position.ToString("F1")))}");
        }
    }

    [Fact]
    public void DownwardTerrainImpactLaunchesTankWithCappedVelocityAndTankLandsAuthoritatively()
    {
        var game = StartGame();
        var before = game.Manager.GetTankBattleSnapshot("host", game.SessionId);
        var fired = game.Manager.FireTankBattleShot("host", new(game.SessionId, "RIGHT", -35, 220)).Snapshot;
        Assert.Equal("TERRAIN", fired.LastShot!.ImpactType);
        Assert.False(fired.Players.Single(tank => tank.PlayerId == game.Host.PlayerId).Airborne);

        game.Clock.Advance(TimeSpan.FromMilliseconds(fired.LastShot.ImpactAtUnixMs - fired.ServerTimeUnixMs));
        var impact = game.Manager.AdvanceTimedStates().Single(change => change.TankBattleSnapshot is not null).TankBattleSnapshot!;
        var launched = impact.Players.Single(tank => tank.PlayerId == game.Host.PlayerId);
        Assert.True(launched.Airborne);
        Assert.InRange(launched.VelocityY, -280, -40);
        Assert.Equal(3, launched.Health);
        Assert.NotEqual(before.TerrainHeights, impact.TerrainHeights);

        var remote = game.Manager.GetTankBattleSnapshot("guest", game.SessionId).Players
            .Single(tank => tank.PlayerId == game.Host.PlayerId);
        Assert.Equal(launched, remote);

        game.Manager.Disconnect("host");
        game.Manager.Attach(game.Host.RoomCode, game.Host.PlayerId, game.Host.ReconnectToken, "host-reconnected");
        var reconnected = game.Manager.GetTankBattleSnapshot("host-reconnected", game.SessionId).Players
            .Single(tank => tank.PlayerId == game.Host.PlayerId);
        Assert.Equal(launched, reconnected);

        var highestY = launched.Y;
        var current = impact;
        for (var step = 0; step < 60 && current.Players.Single(tank => tank.PlayerId == game.Host.PlayerId).Airborne; step++)
        {
            game.Clock.Advance(TimeSpan.FromMilliseconds(100));
            current = game.Manager.AdvanceTimedStates().Single(change => change.TankBattleSnapshot is not null).TankBattleSnapshot!;
            highestY = Math.Min(highestY, current.Players.Single(tank => tank.PlayerId == game.Host.PlayerId).Y);
        }

        var landed = current.Players.Single(tank => tank.PlayerId == game.Host.PlayerId);
        Assert.False(landed.Airborne);
        Assert.Equal(0, landed.VelocityX);
        Assert.Equal(0, landed.VelocityY);
        Assert.True(highestY < launched.Y - 15);
        Assert.Equal(TerrainAt(current, landed.X) - 12, landed.Y, precision: 6);
    }

    [Fact]
    public void DistantImpactDoesNotLaunchShooter()
    {
        var game = StartGame();
        var fired = game.Manager.FireTankBattleShot("host", new(game.SessionId, "RIGHT", 45, 620)).Snapshot;
        var shooter = fired.Players.Single(tank => tank.PlayerId == game.Host.PlayerId);
        var deltaX = fired.LastShot!.Impact.X - shooter.X;
        var deltaY = fired.LastShot.Impact.Y - shooter.Y;
        Assert.True(Math.Sqrt(deltaX * deltaX + deltaY * deltaY) > 120);
        game.Clock.Advance(TimeSpan.FromMilliseconds(fired.LastShot.ImpactAtUnixMs - fired.ServerTimeUnixMs));
        var resolved = game.Manager.AdvanceTimedStates().Single(change => change.TankBattleSnapshot is not null).TankBattleSnapshot!;
        Assert.False(resolved.Players.Single(tank => tank.PlayerId == game.Host.PlayerId).Airborne);
    }

    [Fact]
    public void TeammatesCanCrossWhileEnemyTanksStillBlockMovement()
    {
        var teamGame = StartGame(extraPlayerCount: 2);
        var initial = teamGame.Manager.GetTankBattleSnapshot("host", teamGame.SessionId);
        var redTeammateX = initial.Players.Single(player => player.PlayerId == teamGame.ExtraPlayers[0].PlayerId).X;
        TankBattleGameSnapshot crossedRed = initial;
        for (var step = 0; step < 30; step++)
            crossedRed = teamGame.Manager.MoveTankBattleTank("host", new(teamGame.SessionId, 1)).Snapshot;
        Assert.True(crossedRed.Players.Single(player => player.PlayerId == teamGame.Host.PlayerId).X > redTeammateX);

        var blueTeammateX = initial.Players.Single(player => player.PlayerId == teamGame.ExtraPlayers[1].PlayerId).X;
        TankBattleGameSnapshot crossedBlue = crossedRed;
        for (var step = 0; step < 30; step++)
            crossedBlue = teamGame.Manager.MoveTankBattleTank("guest", new(teamGame.SessionId, -1)).Snapshot;
        Assert.True(crossedBlue.Players.Single(player => player.PlayerId == teamGame.Guest.PlayerId).X < blueTeammateX);

        var remoteView = teamGame.Manager.GetTankBattleSnapshot("extra-0", teamGame.SessionId);
        Assert.Equal(
            crossedBlue.Players.Single(player => player.PlayerId == teamGame.Host.PlayerId).X,
            remoteView.Players.Single(player => player.PlayerId == teamGame.Host.PlayerId).X);
        Assert.Equal(
            crossedBlue.Players.Single(player => player.PlayerId == teamGame.Guest.PlayerId).X,
            remoteView.Players.Single(player => player.PlayerId == teamGame.Guest.PlayerId).X);

        var enemyGame = StartGame();
        TankBattleGameSnapshot blocked = enemyGame.Manager.GetTankBattleSnapshot("host", enemyGame.SessionId);
        for (var step = 0; step < 100; step++)
            blocked = enemyGame.Manager.MoveTankBattleTank("host", new(enemyGame.SessionId, 1)).Snapshot;
        var red = blocked.Players.Single(player => player.PlayerId == enemyGame.Host.PlayerId);
        var blue = blocked.Players.Single(player => player.PlayerId == enemyGame.Guest.PlayerId);
        Assert.True(blue.X - red.X >= 30);
    }

    [Fact]
    public void AuthoritativeShotKeepsTerrainIntactUntilItsSingleImpact()
    {
        var game = StartGame();
        var before = game.Manager.GetTankBattleSnapshot("host", game.SessionId);
        var fired = game.Manager.FireTankBattleShot("host", new(game.SessionId, "RIGHT", -35, 220)).Snapshot;

        Assert.NotNull(fired.LastShot);
        Assert.True(fired.LastShot.Path.Count > 4);
        Assert.True(fired.LastShot.Path[1].Y > fired.LastShot.Path[0].Y);
        Assert.Equal("ACTIVE", fired.LastShot.Status);
        Assert.Contains(fired.Projectiles, projectile => projectile.ShotId == fired.LastShot.ShotId
            && projectile.Status == "ACTIVE");
        Assert.Equal(fired.LastShot.Path[0], fired.LastShot.Launch);
        Assert.Equal(360, fired.LastShot.Gravity);
        Assert.Equal(game.Clock.GetUtcNow().ToUnixTimeMilliseconds(), fired.ServerTimeUnixMs);
        Assert.Equal(before.TerrainHeights, fired.TerrainHeights);
        Assert.Equal(before.Players.Select(player => player.Health), fired.Players.Select(player => player.Health));
        Assert.Equal(before.Revision + 1, fired.Revision);
        Assert.Equal(-35, fired.Players.Single(player => player.PlayerId == game.Host.PlayerId).TurretAngle);

        var remoteView = game.Manager.GetTankBattleSnapshot("guest", game.SessionId);
        var remoteShot = Assert.Single(remoteView.Projectiles, projectile => projectile.ShotId == fired.LastShot.ShotId);
        Assert.Equal(fired.LastShot.Launch, remoteShot.Launch);
        Assert.Equal(fired.LastShot.Velocity, remoteShot.Velocity);
        Assert.Equal(fired.LastShot.Impact, remoteShot.Impact);
        Assert.Equal(fired.LastShot.ImpactAtUnixMs, remoteShot.ImpactAtUnixMs);

        var flightMilliseconds = fired.LastShot.ImpactAtUnixMs - game.Clock.GetUtcNow().ToUnixTimeMilliseconds();
        Assert.True(flightMilliseconds > fired.LastShot.Path.Count * 20);
        game.Clock.Advance(TimeSpan.FromMilliseconds(flightMilliseconds - 1));
        game.Manager.AdvanceTimedStates();
        var stillFlying = game.Manager.GetTankBattleSnapshot("host", game.SessionId);
        Assert.Contains(stillFlying.Projectiles, projectile => projectile.ShotId == fired.LastShot.ShotId
            && projectile.Status == "ACTIVE");
        Assert.Equal(before.TerrainHeights, stillFlying.TerrainHeights);

        game.Clock.Advance(TimeSpan.FromMilliseconds(1));
        var impacted = game.Manager.AdvanceTimedStates().Single(change => change.TankBattleSnapshot is not null).TankBattleSnapshot!;
        Assert.Equal("IMPACTED", impacted.LastShot!.Status);
        Assert.NotEqual(before.TerrainHeights, impacted.TerrainHeights);
        var impactedRevision = impacted.Revision;

        game.Manager.AdvanceTimedStates();
        Assert.Equal(impactedRevision, game.Manager.GetTankBattleSnapshot("host", game.SessionId).Revision);
        Assert.Equal(impacted.TerrainHeights, game.Manager.GetTankBattleSnapshot("host", game.SessionId).TerrainHeights);
    }

    [Fact]
    public void ShotDirectionUsesFacingAndAllowsDownwardAim()
    {
        var game = StartGame();
        game.Manager.MoveTankBattleTank("guest", new(game.SessionId, 1));
        var fired = game.Manager.FireTankBattleShot("guest", new(game.SessionId, "RIGHT", -20, 260)).Snapshot;

        Assert.Equal("RIGHT", fired.Players.Single(player => player.PlayerId == game.Guest.PlayerId).Facing);
        Assert.Equal(-20, fired.LastShot!.Angle);
        Assert.True(fired.LastShot.Path[1].X > fired.LastShot.Path[0].X);
        Assert.True(fired.LastShot.Path[1].Y > fired.LastShot.Path[0].Y);
    }

    [Fact]
    public void OutOfBoundsShotMissesWithoutDestroyingTerrain()
    {
        var game = StartGame();
        var before = game.Manager.GetTankBattleSnapshot("host", game.SessionId);
        var fired = game.Manager.FireTankBattleShot("host", new(game.SessionId, "LEFT", 45, 620)).Snapshot;
        Assert.Equal("OUT_OF_BOUNDS", fired.LastShot!.ImpactType);
        Assert.Equal(before.TerrainHeights, fired.TerrainHeights);

        game.Clock.Advance(TimeSpan.FromMilliseconds(
            fired.LastShot.ImpactAtUnixMs - game.Clock.GetUtcNow().ToUnixTimeMilliseconds()));
        var missed = game.Manager.AdvanceTimedStates().Single(change => change.TankBattleSnapshot is not null).TankBattleSnapshot!;
        Assert.Equal("MISSED", missed.LastShot!.Status);
        Assert.Equal(before.TerrainHeights, missed.TerrainHeights);
        Assert.Equal(before.Players.Select(player => player.Health), missed.Players.Select(player => player.Health));
    }

    [Fact]
    public void EliminatedTeamQuestionCompletionStartsSynchronizedNextRound()
    {
        var game = StartGame();
        TankBattleGameSnapshot snapshot = game.Manager.GetTankBattleSnapshot("host", game.SessionId);
        var outcomes = new List<string>();

        for (var index = 0; index < 8 && snapshot.Phase == "RUNNING"; index++)
        {
            for (var move = 0; move < 100; move++)
            {
                var hostX = snapshot.Players.Single(player => player.PlayerId == game.Host.PlayerId).X;
                var guestX = snapshot.Players.Single(player => player.PlayerId == game.Guest.PlayerId).X;
                snapshot = game.Manager.MoveTankBattleTank(
                    "host", new(game.SessionId, hostX < guestX ? 1 : -1)).Snapshot;
            }
            var shooterX = snapshot.Players.Single(player => player.PlayerId == game.Host.PlayerId).X;
            var targetX = snapshot.Players.Single(player => player.PlayerId == game.Guest.PlayerId).X;
            var facing = shooterX < targetX ? "RIGHT" : "LEFT";
            game.Clock.Advance(TimeSpan.FromMilliseconds(901));
            var fired = game.Manager.FireTankBattleShot("host", new(game.SessionId, facing, -35, 220)).Snapshot;
            Assert.Equal(snapshot.TerrainHeights, fired.TerrainHeights);
            Assert.Equal(snapshot.Players.Select(player => player.Health), fired.Players.Select(player => player.Health));
            game.Clock.Advance(TimeSpan.FromMilliseconds(
                fired.LastShot!.ImpactAtUnixMs - game.Clock.GetUtcNow().ToUnixTimeMilliseconds()));
            snapshot = game.Manager.AdvanceTimedStates().Single(change => change.TankBattleSnapshot is not null).TankBattleSnapshot!;
            outcomes.Add($"{facing}: {snapshot.LastShot!.ImpactType} at "
                + $"{snapshot.LastShot.Impact.X:F0},{snapshot.LastShot.Impact.Y:F0}; "
                + $"health {string.Join(",", snapshot.Players.Select(player => player.Health))}");
            for (var physicsStep = 0; physicsStep < 60
                 && snapshot.Phase == "RUNNING" && snapshot.Players.Any(player => player.Airborne);
                 physicsStep++)
            {
                game.Clock.Advance(TimeSpan.FromMilliseconds(100));
                snapshot = game.Manager.AdvanceTimedStates()
                    .Single(change => change.TankBattleSnapshot is not null).TankBattleSnapshot!;
            }
        }

        Assert.True(snapshot.Phase == "QUESTION", string.Join(Environment.NewLine, outcomes));
        Assert.Equal("RED", snapshot.Result!.WinnerTeam);
        Assert.Equal("BLUE", snapshot.Result.LoserTeam);
        Assert.Contains(game.Guest.PlayerId, snapshot.Result.EliminatedPlayerIds);
        Assert.Equal("BLUE", snapshot.ActiveQuestion!.LoserTeam);
        Assert.Throws<RoomException>(() => game.Manager.CompleteTankBattleQuestion(
            "host", new(game.SessionId, snapshot.ActiveQuestion.QuestionId)));

        var completed = game.Manager.CompleteTankBattleQuestion(
            "guest", new(game.SessionId, snapshot.ActiveQuestion.QuestionId)).Snapshot;
        Assert.Equal("RUNNING", completed.Phase);
        Assert.Equal(2, completed.RoundNumber);
        Assert.Null(completed.ActiveQuestion);
        Assert.Null(completed.Result);
        Assert.Null(completed.LastShot);
        Assert.NotEqual(snapshot.MapSeed, completed.MapSeed);
        Assert.All(completed.Players, player =>
        {
            Assert.True(player.Alive);
            Assert.Equal(3, player.Health);
            Assert.Equal(player.Team == "RED" ? "RIGHT" : "LEFT", player.Facing);
        });
        var hostView = game.Manager.GetTankBattleSnapshot("host", game.SessionId);
        Assert.Equal(completed.Revision, hostView.Revision);
        Assert.Equal(completed.RoundNumber, hostView.RoundNumber);
        Assert.Equal(completed.TerrainHeights, hostView.TerrainHeights);
    }

    private static int PlayerOrder(Game game, string playerId)
    {
        if (playerId == game.Host.PlayerId) return 0;
        if (playerId == game.Guest.PlayerId) return 1;
        return Array.FindIndex(game.ExtraPlayers, player => player.PlayerId == playerId) + 2;
    }

    private static double TerrainAt(TankBattleGameSnapshot snapshot, double x)
    {
        var clamped = Math.Clamp(x / snapshot.TerrainStep, 0, snapshot.TerrainHeights.Count - 1);
        var left = (int)Math.Floor(clamped);
        var right = Math.Min(left + 1, snapshot.TerrainHeights.Count - 1);
        var amount = clamped - left;
        return snapshot.TerrainHeights[left] + (snapshot.TerrainHeights[right] - snapshot.TerrainHeights[left]) * amount;
    }

    private static Game StartGame(int extraPlayerCount = 0)
    {
        var clock = new MutableTimeProvider(DateTimeOffset.Parse("2026-08-28T10:00:00Z"));
        var manager = new RoomManager(clock, Options.Create(new RoomOptions
        {
            DisconnectGraceSeconds = 25,
            QuestionLoadingMilliseconds = 1800,
        }), new FixedRoomRandom(3), HideSeekTestSupport.CreateManager());
        var host = manager.Create(new CreateRoomRequest("Arda", "#ef5350", "Tank Room", 10, 30, 30));
        var guest = manager.Join(host.RoomCode, new JoinRoomRequest("Ali", "#42a5f5"));
        var extras = Enumerable.Range(0, extraPlayerCount)
            .Select(index => manager.Join(host.RoomCode, new JoinRoomRequest($"Player {index + 3}", "#abcdef")))
            .ToArray();
        manager.Attach(host.RoomCode, host.PlayerId, host.ReconnectToken, "host");
        manager.Attach(host.RoomCode, guest.PlayerId, guest.ReconnectToken, "guest");
        foreach (var (player, index) in extras.Select((player, index) => (player, index)))
            manager.Attach(host.RoomCode, player.PlayerId, player.ReconnectToken, $"extra-{index}");
        manager.BeginGameSelection("host", ["tank-battle"]);
        var room = manager.ResolveVote("host").Snapshot;
        return new(manager, clock, host, guest, extras, room.CurrentGameSession!.GameSessionId);
    }

    private sealed record Game(
        RoomManager Manager,
        MutableTimeProvider Clock,
        RoomAdmission Host,
        RoomAdmission Guest,
        RoomAdmission[] ExtraPlayers,
        string SessionId);

    private sealed class MutableTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
        public void Advance(TimeSpan amount) => now += amount;
    }

    private sealed class FixedRoomRandom(int value) : IRoomRandom
    {
        public int Next(int maximumExclusive) => value % maximumExclusive;
        public int Next(int minimumInclusive, int maximumExclusive) => minimumInclusive + value % (maximumExclusive - minimumInclusive);
    }
}
