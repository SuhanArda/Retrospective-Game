using Microsoft.Extensions.Options;
using Retrospective.Server.Contracts;
using Retrospective.Server.Rooms;

namespace Retrospective.Server.Tests;

public sealed class RetroRushRoomManagerTests
{
    [Fact]
    public void SessionOwnsOneSeedRoundAndAllPlayersShareTheAuthoritativeSpawn()
    {
        var game = StartGame(extraPlayerCount: 4);
        var snapshot = game.Manager.GetRetroRushSnapshot("host", game.SessionId);

        Assert.Equal(1, snapshot.RoundId);
        Assert.Equal(game.Room.CurrentGameSession!.Seed, snapshot.MapSeed);
        Assert.Equal(game.Clock.GetUtcNow().ToUnixTimeMilliseconds() + 3_500, snapshot.RoundStartAtUnixMs);
        Assert.Equal(snapshot.RoundStartAtUnixMs, game.Room.CurrentGameSession.RoundStartAtUnixMs);
        Assert.Equal(180, snapshot.SpawnX);
        Assert.Equal(540, snapshot.SpawnY);
        Assert.Equal(6, snapshot.Players.Count);
        Assert.Equal(Enumerable.Range(0, 6), snapshot.Players.Select(player => player.Slot));
        Assert.All(snapshot.Players, player =>
        {
            Assert.Equal(180, player.X);
            Assert.Equal(540, player.Y);
            Assert.Equal(snapshot.RoundStartAtUnixMs + 7_000, player.Ability1AvailableAtUnixMs);
            Assert.Equal(snapshot.RoundStartAtUnixMs + 7_000, player.Ability2AvailableAtUnixMs);
            Assert.Equal(snapshot.RoundStartAtUnixMs + 7_000, player.Ability3AvailableAtUnixMs);
        });
    }

    [Fact]
    public void CountdownDeadlineRejectsAllGameplayAndDoesNotPublishMovementBeforeStart()
    {
        var game = StartGame();
        var initial = game.Manager.GetRetroRushSnapshot("host", game.SessionId);
        var moved = PlayerUpdate(game, game.Host.PlayerId, sequence: 1, x: 420);

        Assert.Throws<RoomException>(() => game.Manager.UpdateRetroRushPlayer("host", moved));
        Assert.Equal("ROUND_NOT_STARTED", game.Manager.RequestRetroRushShove(
            "host", new(game.SessionId, 1, game.Guest.PlayerId, 1)).Result.Rejection);
        Assert.Throws<RoomException>(() => game.Manager.RequestRetroRushRocketFire("host", new(game.SessionId, 1)));
        Assert.Throws<RoomException>(() => game.Manager.RequestRetroRushRocketHit("host", new(game.SessionId, 1, "invented")));
        Assert.Throws<RoomException>(() => game.Manager.RequestRetroRushPlayerElimination(
            "host", new(game.SessionId, 1, game.Host.PlayerId)));
        Assert.Throws<RoomException>(() => game.Manager.UseRetroRushAbility("host", new(game.SessionId, 1, "speed")));

        var stillLocked = game.Manager.GetRetroRushSnapshot("guest", game.SessionId);
        Assert.Equal("COUNTDOWN", stillLocked.Phase);
        Assert.Equal(initial.RoundStartAtUnixMs, stillLocked.RoundStartAtUnixMs);
        Assert.All(stillLocked.Players, player =>
        {
            Assert.Equal(180, player.X);
            Assert.Equal(540, player.Y);
            Assert.Equal(0, player.Sequence);
        });

        game.Clock.Advance(TimeSpan.FromMilliseconds(3_499));
        Assert.Throws<RoomException>(() => game.Manager.UpdateRetroRushPlayer("host", moved));
        game.Clock.Advance(TimeSpan.FromMilliseconds(1));
        Assert.NotNull(game.Manager.UpdateRetroRushPlayer("host", moved).Event);
        Assert.Equal("RUNNING", game.Manager.GetRetroRushSnapshot("guest", game.SessionId).Phase);
    }

    [Fact]
    public void ReconnectDuringCountdownKeepsTheExistingRoundAndDeadline()
    {
        var game = StartGame();
        var initial = game.Manager.GetRetroRushSnapshot("guest", game.SessionId);
        game.Clock.Advance(TimeSpan.FromMilliseconds(1_200));
        game.Manager.Disconnect("guest");
        game.Manager.Attach(game.Host.RoomCode, game.Guest.PlayerId, game.Guest.ReconnectToken, "guest-reconnected");

        var reconnected = game.Manager.GetRetroRushSnapshot("guest-reconnected", game.SessionId);
        Assert.Equal(initial.RoundId, reconnected.RoundId);
        Assert.Equal(initial.RoundStartAtUnixMs, reconnected.RoundStartAtUnixMs);
        Assert.Equal("COUNTDOWN", reconnected.Phase);
        Assert.True(reconnected.RoundStartAtUnixMs > game.Clock.GetUtcNow().ToUnixTimeMilliseconds());
        Assert.Equal(initial.SpawnX, reconnected.SpawnX);
        Assert.Equal(initial.SpawnY, reconnected.SpawnY);
    }

    [Fact]
    public void PlayerCanUpdateOnlySelfInCurrentSessionRoundAndOldSequencesAreIgnored()
    {
        var game = StartGame(running: true);
        var valid = PlayerUpdate(game, game.Host.PlayerId, sequence: 1, x: 200);
        var mutation = game.Manager.UpdateRetroRushPlayer("host", valid);
        Assert.Equal(200, mutation.Event!.X);
        Assert.Null(game.Manager.UpdateRetroRushPlayer("host", valid).Event);

        Assert.Throws<RoomException>(() => game.Manager.UpdateRetroRushPlayer("host", valid with { PlayerId = game.Guest.PlayerId, Sequence = 2 }));
        Assert.Throws<RoomException>(() => game.Manager.UpdateRetroRushPlayer("host", valid with { GameSessionId = "wrong", Sequence = 2 }));
        Assert.Throws<RoomException>(() => game.Manager.UpdateRetroRushPlayer("host", valid with { RoundId = 2, Sequence = 2 }));
        Assert.Throws<RoomException>(() => game.Manager.UpdateRetroRushPlayer("host", valid with { X = double.NaN, Sequence = 2 }));
    }

    [Fact]
    public void ShoveValidatesRangeCooldownSelfAndAlwaysPushesAway()
    {
        var game = StartGame(running: true);
        var shove = game.Manager.RequestRetroRushShove("host", new(game.SessionId, 1, game.Guest.PlayerId, 1));
        Assert.True(shove.Result.Accepted);
        Assert.Equal(300, shove.Applied!.VelocityX);
        Assert.True(double.IsFinite(shove.Applied.VelocityX));

        var duplicate = game.Manager.RequestRetroRushShove("host", new(game.SessionId, 1, game.Guest.PlayerId, 1));
        Assert.False(duplicate.Result.Accepted);
        Assert.Equal("DUPLICATE_SHOVE", duplicate.Result.Rejection);
        Assert.Null(duplicate.Applied);

        for (var sequence = 2; sequence <= 6; sequence++)
        {
            var cooldown = game.Manager.RequestRetroRushShove("host", new(game.SessionId, 1, game.Guest.PlayerId, sequence));
            Assert.False(cooldown.Result.Accepted);
            Assert.Equal("SHOVE_COOLDOWN", cooldown.Result.Rejection);
            Assert.Null(cooldown.Applied);
        }

        game.Clock.Advance(TimeSpan.FromMilliseconds(601));
        game.Manager.UpdateRetroRushPlayer("guest", PlayerUpdate(game, game.Guest.PlayerId, 1, -500));
        var outOfRange = game.Manager.RequestRetroRushShove("host", new(game.SessionId, 1, game.Guest.PlayerId, 7));
        Assert.Equal("SHOVE_OUT_OF_RANGE", outOfRange.Result.Rejection);
        Assert.Null(outOfRange.Applied);

        game.Manager.UpdateRetroRushPlayer("guest", PlayerUpdate(game, game.Guest.PlayerId, 2, 134));
        var recovered = game.Manager.RequestRetroRushShove("host", new(game.SessionId, 1, game.Guest.PlayerId, 8));
        Assert.True(recovered.Result.Accepted);
        Assert.Equal(-300, recovered.Applied!.VelocityX);
        Assert.Equal(2, game.Manager.GetRetroRushSnapshot("host", game.SessionId).Players.Count);
    }

    [Fact]
    public void InvalidShoveTargetsAndStaleRoundsReturnControlledRejections()
    {
        var game = StartGame(running: true);

        Assert.Equal("SELF_SHOVE", game.Manager.RequestRetroRushShove(
            "host", new(game.SessionId, 1, game.Host.PlayerId, 1)).Result.Rejection);
        Assert.Equal("INVALID_SHOVE_TARGET", game.Manager.RequestRetroRushShove(
            "host", new(game.SessionId, 1, "missing-player", 2)).Result.Rejection);
        Assert.Equal("STALE_ROUND", game.Manager.RequestRetroRushShove(
            "host", new(game.SessionId, 99, game.Guest.PlayerId, 3)).Result.Rejection);
        Assert.Equal("WRONG_GAME_SESSION", game.Manager.RequestRetroRushShove(
            "host", new("wrong-session", 1, game.Guest.PlayerId, 4)).Result.Rejection);

        var valid = game.Manager.RequestRetroRushShove("host", new(game.SessionId, 1, game.Guest.PlayerId, 5));
        Assert.True(valid.Result.Accepted);
        Assert.NotNull(valid.Applied);
    }

    [Fact]
    public void RocketHasStableIdentitySameTargetOneHitAndFixedLeftKnockback()
    {
        var game = StartGame(abilitiesUnlocked: true);
        var fired = game.Manager.RequestRetroRushRocketFire("host", new(game.SessionId, 1));
        var rocket = fired.Rocket;
        Assert.NotEmpty(rocket.RocketId);
        Assert.Equal(game.Guest.PlayerId, rocket.TargetPlayerId);
        Assert.Equal("rocket", fired.Ability.AbilityId);
        Assert.Equal(game.Clock.GetUtcNow().ToUnixTimeMilliseconds() + 10_000, fired.Ability.AvailableAtUnixMs);
        Assert.Equal(rocket.TargetPlayerId, game.Manager.GetRetroRushSnapshot("host", game.SessionId).ActiveRockets.Single().TargetPlayerId);

        var hit = game.Manager.RequestRetroRushRocketHit("host", new(game.SessionId, 1, rocket.RocketId));
        Assert.Equal(-450, hit.Event!.VelocityX);
        Assert.Null(game.Manager.RequestRetroRushRocketHit("host", new(game.SessionId, 1, rocket.RocketId)).Event);
        Assert.Throws<RoomException>(() => game.Manager.RequestRetroRushRocketFire("host", new(game.SessionId, 1)));
    }

    [Fact]
    public void InitialAbilityLockThenCooldownExpiryAreServerAuthoritative()
    {
        var game = StartGame(running: true);
        Assert.Equal("ABILITY_INITIAL_LOCK", Assert.Throws<RoomException>(() =>
            game.Manager.UseRetroRushAbility("host", new(game.SessionId, 1, "speed"))).Code);
        Assert.Equal("ABILITY_INITIAL_LOCK", Assert.Throws<RoomException>(() =>
            game.Manager.RequestRetroRushRocketFire("host", new(game.SessionId, 1))).Code);
        Assert.Equal("ABILITY_INITIAL_LOCK", Assert.Throws<RoomException>(() =>
            game.Manager.UseRetroRushAbility("host", new(game.SessionId, 1, "pull"))).Code);

        UnlockAbilities(game);
        var speed = game.Manager.UseRetroRushAbility("host", new(game.SessionId, 1, "speed")).Event!;
        Assert.Equal(game.Clock.GetUtcNow().ToUnixTimeMilliseconds() + 8_000, speed.AvailableAtUnixMs);
        Assert.Equal("SPEED_COOLDOWN", Assert.Throws<RoomException>(() =>
            game.Manager.UseRetroRushAbility("host", new(game.SessionId, 1, "speed"))).Code);
        game.Clock.Advance(TimeSpan.FromMilliseconds(8_000));
        Assert.NotNull(game.Manager.UseRetroRushAbility("host", new(game.SessionId, 1, "speed")).Event);
        Assert.Throws<RoomException>(() => game.Manager.UseRetroRushAbility("host", new(game.SessionId, 1, "invented")));
    }

    [Fact]
    public void PullLeaderSelectsFurthestActivePlayerAndDoesNotCoolDownWithoutTarget()
    {
        var game = StartGame(abilitiesUnlocked: true, extraPlayerCount: 1);
        game.Manager.UpdateRetroRushPlayer("host", PlayerUpdate(game, game.Host.PlayerId, 1, 100));
        game.Manager.UpdateRetroRushPlayer("guest", PlayerUpdate(game, game.Guest.PlayerId, 1, 300));
        game.Manager.UpdateRetroRushPlayer("extra-0", PlayerUpdate(game, game.ExtraPlayers[0].PlayerId, 1, 500));

        var pulled = game.Manager.UseRetroRushAbility("host", new(game.SessionId, 1, "pull")).Event!;
        Assert.Equal(game.ExtraPlayers[0].PlayerId, pulled.TargetPlayerId);
        Assert.Equal(-550, pulled.VelocityX);
        Assert.Equal(game.Clock.GetUtcNow().ToUnixTimeMilliseconds() + 12_000, pulled.AvailableAtUnixMs);
        Assert.Equal(-550, game.Manager.GetRetroRushSnapshot("host", game.SessionId).Players
            .Single(player => player.PlayerId == game.ExtraPlayers[0].PlayerId).VelocityX);

        game.Manager.UpdateRetroRushPlayer("guest", PlayerUpdate(game, game.Guest.PlayerId, 2, 700));
        Assert.Equal("NO_PLAYER_AHEAD", Assert.Throws<RoomException>(() =>
            game.Manager.UseRetroRushAbility("guest", new(game.SessionId, 1, "pull"))).Code);
        game.Manager.UpdateRetroRushPlayer("guest", PlayerUpdate(game, game.Guest.PlayerId, 3, 200));
        Assert.NotNull(game.Manager.UseRetroRushAbility("guest", new(game.SessionId, 1, "pull")).Event);
    }

    [Fact]
    public void EliminatedPlayersCannotUseAnyAbility()
    {
        var game = StartGame(abilitiesUnlocked: true, extraPlayerCount: 1);
        game.Manager.RequestRetroRushPlayerElimination("guest", new(game.SessionId, 1, game.Guest.PlayerId));

        Assert.Equal("PLAYER_NOT_ACTIVE", Assert.Throws<RoomException>(() =>
            game.Manager.UseRetroRushAbility("guest", new(game.SessionId, 1, "speed"))).Code);
        Assert.Equal("PLAYER_NOT_ACTIVE", Assert.Throws<RoomException>(() =>
            game.Manager.RequestRetroRushRocketFire("guest", new(game.SessionId, 1))).Code);
        Assert.Equal("PLAYER_NOT_ACTIVE", Assert.Throws<RoomException>(() =>
            game.Manager.UseRetroRushAbility("guest", new(game.SessionId, 1, "pull"))).Code);
    }

    [Fact]
    public void FirstEliminationDoesNotEndRoundAndEliminatedReconnectStaysEliminated()
    {
        var game = StartGame(running: true, extraPlayerCount: 1);
        var eliminated = game.Manager.RequestRetroRushPlayerElimination("guest", new(game.SessionId, 1, game.Guest.PlayerId)).Event!;
        var snapshot = game.Manager.GetRetroRushSnapshot("host", game.SessionId);

        Assert.Equal(1, eliminated.Order);
        Assert.Equal("RUNNING", snapshot.Phase);
        Assert.Null(snapshot.ActiveQuestion);
        Assert.Empty(snapshot.Ranking);
        Assert.Equal(game.Guest.PlayerId, Assert.Single(snapshot.EliminationOrder).PlayerId);
        Assert.Equal("FINISHED", snapshot.Players.Single(player => player.PlayerId == game.Guest.PlayerId).MovementState);
        Assert.Null(game.Manager.RequestRetroRushPlayerElimination("guest", new(game.SessionId, 1, game.Guest.PlayerId)).Event);

        game.Manager.Disconnect("guest");
        game.Manager.Attach(game.Host.RoomCode, game.Guest.PlayerId, game.Guest.ReconnectToken, "guest-eliminated-reconnected");
        var reconnected = game.Manager.GetRetroRushSnapshot("guest-eliminated-reconnected", game.SessionId);
        Assert.Equal("RUNNING", reconnected.Phase);
        Assert.Equal("FINISHED", reconnected.Players.Single(player => player.PlayerId == game.Guest.PlayerId).MovementState);
        Assert.Null(game.Manager.UpdateRetroRushPlayer(
            "guest-eliminated-reconnected", PlayerUpdate(game, game.Guest.PlayerId, 1, 500)).Event);
    }

    [Fact]
    public void LastSurvivorFinishesExactlyOnceAndLastPlaceOwnsQuestionAndRestart()
    {
        var game = StartGame(running: true, extraPlayerCount: 1);
        var survivor = Assert.Single(game.ExtraPlayers);
        game.Manager.RequestRetroRushPlayerElimination("guest", new(game.SessionId, 1, game.Guest.PlayerId));
        var finalElimination = game.Manager.RequestRetroRushPlayerElimination("host", new(game.SessionId, 1, game.Host.PlayerId)).Event!;
        var results = game.Manager.GetRetroRushSnapshot("host", game.SessionId);

        Assert.Equal(2, finalElimination.Order);
        Assert.Equal("RESULTS", results.Phase);
        Assert.Equal(new[] { survivor.PlayerId, game.Host.PlayerId, game.Guest.PlayerId },
            results.Ranking.Select(entry => entry.PlayerId));
        Assert.Equal(new[] { 1, 2, 3 }, results.Ranking.Select(entry => entry.Place));
        Assert.Equal(game.Guest.PlayerId, results.LastPlacePlayerId);
        Assert.Null(results.ActiveQuestion);
        Assert.Null(game.Manager.RequestRetroRushPlayerElimination("host", new(game.SessionId, 1, game.Host.PlayerId)).Event);

        game.Clock.Advance(TimeSpan.FromMilliseconds(4_000));
        game.Manager.AdvanceTimedStates();
        var questionPhase = game.Manager.GetRetroRushSnapshot("host", game.SessionId);
        Assert.Equal("QUESTION", questionPhase.Phase);
        var question = questionPhase.ActiveQuestion!;
        Assert.Equal(game.Guest.PlayerId, question.OwnerPlayerId);
        Assert.Throws<RoomException>(() => game.Manager.CompleteRetroRushQuestion(
            "host", new(game.SessionId, 1, question.QuestionId)));

        game.Manager.Disconnect("guest");
        game.Manager.Attach(game.Host.RoomCode, game.Guest.PlayerId, game.Guest.ReconnectToken, "guest-question-reconnected");
        Assert.Equal(question, game.Manager.GetRetroRushSnapshot("guest-question-reconnected", game.SessionId).ActiveQuestion);

        var restarted = game.Manager.CompleteRetroRushQuestion(
            "guest-question-reconnected", new(game.SessionId, 1, question.QuestionId)).Event!;
        Assert.Equal(2, restarted.RoundId);
        Assert.NotEqual(game.InitialSeed, restarted.MapSeed);
        Assert.Equal("COUNTDOWN", restarted.Phase);
        Assert.NotEqual(game.Room.CurrentGameSession!.RoundStartAtUnixMs, restarted.RoundStartAtUnixMs);
        Assert.Equal(game.Clock.GetUtcNow().ToUnixTimeMilliseconds() + 3_500, restarted.RoundStartAtUnixMs);
        Assert.Equal(180, restarted.SpawnX);
        Assert.Equal(540, restarted.SpawnY);
        Assert.Equal(restarted.RoundStartAtUnixMs,
            game.Manager.Get(game.Host.RoomCode)!.CurrentGameSession!.RoundStartAtUnixMs);
        Assert.Empty(restarted.ActiveRockets);
        Assert.Empty(restarted.EliminationOrder);
        Assert.Empty(restarted.Ranking);
        Assert.Null(restarted.LastPlacePlayerId);
        Assert.Null(restarted.ActiveQuestion);
        Assert.All(restarted.Players, player =>
        {
            Assert.Equal(restarted.RoundStartAtUnixMs + 7_000, player.Ability1AvailableAtUnixMs);
            Assert.Equal(restarted.RoundStartAtUnixMs + 7_000, player.Ability2AvailableAtUnixMs);
            Assert.Equal(restarted.RoundStartAtUnixMs + 7_000, player.Ability3AvailableAtUnixMs);
        });
        Assert.All(restarted.Players, player => Assert.Equal("ACTIVE", player.MovementState));
        Assert.All(restarted.Players, player =>
        {
            Assert.Equal(180, player.X);
            Assert.Equal(540, player.Y);
        });
        Assert.Equal(3, restarted.Players.Count);
        game.Clock.Advance(TimeSpan.FromMilliseconds(3_501));
        var firstRoundTwoUpdate = PlayerUpdate(game, game.Host.PlayerId, sequence: 1, x: 260, roundId: 2);
        Assert.NotNull(game.Manager.UpdateRetroRushPlayer("host", firstRoundTwoUpdate).Event);
        Assert.Throws<RoomException>(() => game.Manager.UpdateRetroRushPlayer("host", firstRoundTwoUpdate with { RoundId = 1, Sequence = 999 }));
        Assert.Throws<RoomException>(() => game.Manager.CompleteRetroRushQuestion(
            "guest-question-reconnected", new(game.SessionId, 1, question.QuestionId)));
    }

    [Fact]
    public void TimeoutRanksAllSurvivorsByProgressAboveEliminatedPlayers()
    {
        var game = StartGame(running: true, extraPlayerCount: 2);
        game.Manager.UpdateRetroRushPlayer("host", PlayerUpdate(game, game.Host.PlayerId, 1, 400));
        game.Manager.UpdateRetroRushPlayer("guest", PlayerUpdate(game, game.Guest.PlayerId, 1, 900));
        game.Manager.UpdateRetroRushPlayer("extra-0", PlayerUpdate(game, game.ExtraPlayers[0].PlayerId, 1, 650));
        game.Manager.UpdateRetroRushPlayer("extra-1", PlayerUpdate(game, game.ExtraPlayers[1].PlayerId, 1, 700));
        game.Manager.RequestRetroRushPlayerElimination("extra-0", new(game.SessionId, 1, game.ExtraPlayers[0].PlayerId));

        var before = game.Manager.GetRetroRushSnapshot("host", game.SessionId);
        game.Clock.Advance(TimeSpan.FromMilliseconds(before.RoundDeadlineAtUnixMs - game.Clock.GetUtcNow().ToUnixTimeMilliseconds()));
        var changes = game.Manager.AdvanceTimedStates();
        var timeout = game.Manager.GetRetroRushSnapshot("host", game.SessionId);

        Assert.Contains(changes, change => change.RetroRushSnapshot?.Phase == "RESULTS");
        Assert.Equal("RESULTS", timeout.Phase);
        Assert.Equal(new[] { game.Guest.PlayerId, game.ExtraPlayers[1].PlayerId, game.Host.PlayerId, game.ExtraPlayers[0].PlayerId },
            timeout.Ranking.Select(entry => entry.PlayerId));
        Assert.Equal(game.ExtraPlayers[0].PlayerId, timeout.LastPlacePlayerId);
        Assert.All(timeout.Ranking.Take(3), entry => Assert.False(entry.Eliminated));
        Assert.True(timeout.Ranking.Last().Eliminated);
        Assert.DoesNotContain(game.Manager.AdvanceTimedStates(), change => change.RetroRushSnapshot?.Phase == "RESULTS");
    }

    [Fact]
    public void DisconnectAndReconnectPreservePlayerIdWithoutDuplicatingEntity()
    {
        var game = StartGame(abilitiesUnlocked: true);
        game.Manager.UpdateRetroRushPlayer(
            "guest", PlayerUpdate(game, game.Guest.PlayerId, sequence: 1, x: 420));
        var fired = game.Manager.RequestRetroRushRocketFire("guest", new(game.SessionId, 1));
        var rocketAvailableAt = fired.Ability.AvailableAtUnixMs;
        game.Clock.Advance(TimeSpan.FromMilliseconds(2_000));
        game.Manager.Disconnect("guest");
        var disconnected = game.Manager.GetRetroRushSnapshot("host", game.SessionId);
        Assert.False(disconnected.Players.Single(player => player.PlayerId == game.Guest.PlayerId).Connected);

        game.Manager.Attach(game.Host.RoomCode, game.Guest.PlayerId, game.Guest.ReconnectToken, "guest-new");
        var reconnected = game.Manager.GetRetroRushSnapshot("guest-new", game.SessionId);
        Assert.Equal(2, reconnected.Players.Count);
        var guest = reconnected.Players.Single(player => player.PlayerId == game.Guest.PlayerId);
        Assert.True(guest.Connected);
        Assert.Equal(420, guest.X);
        Assert.Equal(540, guest.Y);
        Assert.Equal(rocketAvailableAt, guest.Ability2AvailableAtUnixMs);
        Assert.Equal("ROCKET_COOLDOWN", Assert.Throws<RoomException>(() =>
            game.Manager.RequestRetroRushRocketFire("guest-new", new(game.SessionId, 1))).Code);
        game.Clock.Advance(TimeSpan.FromMilliseconds(8_000));
        Assert.NotNull(game.Manager.RequestRetroRushRocketFire("guest-new", new(game.SessionId, 1)).Rocket);
    }

    private static UpdateRetroRushPlayerRequest PlayerUpdate(Game game, string playerId, long sequence, double x, int roundId = 1) =>
        new(game.SessionId, playerId, roundId, x, 540, 10, 0, "right", "ACTIVE", "running", sequence, 1000 + sequence);

    private static void UnlockAbilities(Game game)
    {
        var player = game.Manager.GetRetroRushSnapshot("host", game.SessionId).Players
            .Single(candidate => candidate.PlayerId == game.Host.PlayerId);
        var remaining = player.Ability1AvailableAtUnixMs - game.Clock.GetUtcNow().ToUnixTimeMilliseconds();
        if (remaining > 0) game.Clock.Advance(TimeSpan.FromMilliseconds(remaining));
    }

    private static Game StartGame(bool running = false, bool abilitiesUnlocked = false, int extraPlayerCount = 0)
    {
        var clock = new MutableTimeProvider(DateTimeOffset.Parse("2026-08-12T10:00:00Z"));
        var manager = new RoomManager(clock, Options.Create(new RoomOptions
        {
            DisconnectGraceSeconds = 25,
            QuestionLoadingMilliseconds = 1800,
        }), new FixedRoomRandom(7));
        var host = manager.Create(new CreateRoomRequest("Arda", "#654321", "Retro", 8, 30, 30));
        var guest = manager.Join(host.RoomCode, new JoinRoomRequest("Ali", "#123456"));
        var extraPlayers = Enumerable.Range(0, extraPlayerCount)
            .Select(index => manager.Join(host.RoomCode, new JoinRoomRequest($"Player {index + 3}", "#abcdef")))
            .ToArray();
        manager.Attach(host.RoomCode, host.PlayerId, host.ReconnectToken, "host");
        manager.Attach(host.RoomCode, guest.PlayerId, guest.ReconnectToken, "guest");
        foreach (var (player, index) in extraPlayers.Select((player, index) => (player, index)))
            manager.Attach(host.RoomCode, player.PlayerId, player.ReconnectToken, $"extra-{index}");
        manager.BeginGameSelection("host", ["retro-rush"]);
        var room = manager.ResolveVote("host").Snapshot;
        if (abilitiesUnlocked) clock.Advance(TimeSpan.FromMilliseconds(10_500));
        else if (running) clock.Advance(TimeSpan.FromMilliseconds(3_501));
        return new(manager, clock, host, guest, extraPlayers, room, room.CurrentGameSession!.GameSessionId, room.CurrentGameSession.Seed);
    }

    private sealed record Game(
        RoomManager Manager, MutableTimeProvider Clock, RoomAdmission Host, RoomAdmission Guest,
        IReadOnlyList<RoomAdmission> ExtraPlayers, RoomSnapshot Room, string SessionId, int InitialSeed);

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
