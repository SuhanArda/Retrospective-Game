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
        Assert.Equal(6, snapshot.Players.Count);
        Assert.Equal(Enumerable.Range(0, 6), snapshot.Players.Select(player => player.Slot));
        Assert.All(snapshot.Players, player =>
        {
            Assert.Equal(180, player.X);
            Assert.Equal(540, player.Y);
            Assert.Empty(player.OwnedAbilityIds);
        });
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
        var game = StartGame(running: true);
        Assert.Throws<RoomException>(() => game.Manager.RequestRetroRushRocketFire("host", new(game.SessionId, 1)));
        game.Manager.RequestRetroRushPickupCollection(
            "host", new(game.SessionId, 1, "chunk-1-ability-upper-platform-pickup-0", "rocket"));
        var rocket = game.Manager.RequestRetroRushRocketFire("host", new(game.SessionId, 1)).Event!;
        Assert.NotEmpty(rocket.RocketId);
        Assert.Equal(game.Guest.PlayerId, rocket.TargetPlayerId);
        Assert.Equal(rocket.TargetPlayerId, game.Manager.GetRetroRushSnapshot("host", game.SessionId).ActiveRockets.Single().TargetPlayerId);

        var hit = game.Manager.RequestRetroRushRocketHit("host", new(game.SessionId, 1, rocket.RocketId));
        Assert.Equal(-450, hit.Event!.VelocityX);
        Assert.Null(game.Manager.RequestRetroRushRocketHit("host", new(game.SessionId, 1, rocket.RocketId)).Event);
        Assert.Throws<RoomException>(() => game.Manager.RequestRetroRushRocketFire("host", new(game.SessionId, 1)));
    }

    [Fact]
    public void PickupCollectionIsSharedAndIdempotent()
    {
        var game = StartGame(running: true);
        const string pickupId = "chunk-2-safe-flat-pickup-0";
        var collected = game.Manager.RequestRetroRushPickupCollection("host", new(game.SessionId, 1, pickupId, "rocket"));
        Assert.Equal(pickupId, collected.Event!.PickupId);
        Assert.Null(game.Manager.RequestRetroRushPickupCollection("host", new(game.SessionId, 1, pickupId, "rocket")).Event);
        var snapshot = game.Manager.GetRetroRushSnapshot("guest", game.SessionId);
        Assert.Contains(pickupId, snapshot.CollectedPickupIds);
        Assert.Contains("rocket", snapshot.Players.Single(player => player.PlayerId == game.Host.PlayerId).OwnedAbilityIds);
        Assert.Empty(snapshot.Players.Single(player => player.PlayerId == game.Guest.PlayerId).OwnedAbilityIds);
        Assert.Throws<RoomException>(() => game.Manager.RequestRetroRushRocketFire("guest", new(game.SessionId, 1)));
        Assert.Throws<RoomException>(() => game.Manager.RequestRetroRushPickupCollection("host", new(game.SessionId, 1, "invented", "rocket")));
    }

    [Fact]
    public void SpeedActivationIsServerValidatedAndPickupRefreshesIt()
    {
        var game = StartGame(running: true);
        Assert.Throws<RoomException>(() => game.Manager.UseRetroRushAbility("host", new(game.SessionId, 1, "speed")));
        Assert.Throws<RoomException>(() => game.Manager.UseRetroRushAbility("host", new(game.SessionId, 1, "ask")));
        game.Manager.RequestRetroRushPickupCollection("host", new(game.SessionId, 1, "chunk-2-ability-upper-platform-pickup-0", "speed"));
        game.Manager.UseRetroRushAbility("host", new(game.SessionId, 1, "speed"));
        Assert.Throws<RoomException>(() => game.Manager.UseRetroRushAbility("host", new(game.SessionId, 1, "speed")));
        game.Manager.RequestRetroRushPickupCollection("host", new(game.SessionId, 1, "chunk-3-safe-flat-pickup-0", "speed"));
        game.Manager.UseRetroRushAbility("host", new(game.SessionId, 1, "speed"));
        Assert.Throws<RoomException>(() => game.Manager.UseRetroRushAbility("host", new(game.SessionId, 1, "invented")));
        game.Manager.RequestRetroRushPickupCollection("host", new(game.SessionId, 1, "chunk-4-ability-upper-platform-pickup-0", "ask"));
        game.Manager.UseRetroRushAbility("host", new(game.SessionId, 1, "ask"));
        var target = game.Manager.RequestRetroRushAskTarget("host", new(game.SessionId, 1, game.Guest.PlayerId)).Event!;
        Assert.Equal(game.Guest.PlayerId, target.TargetPlayerId);
        Assert.Throws<RoomException>(() => game.Manager.RequestRetroRushAskTarget("host", new(game.SessionId, 1, game.Guest.PlayerId)));
    }

    [Fact]
    public void EliminationQuestionAndRoundRestartAreOwnerAuthorizedAndExactlyOnce()
    {
        var game = StartGame(running: true);
        game.Manager.RequestRetroRushPickupCollection(
            "host", new(game.SessionId, 1, "chunk-1-ability-upper-platform-pickup-0", "rocket"));
        var eliminated = game.Manager.RequestRetroRushPlayerElimination("guest", new(game.SessionId, 1, game.Guest.PlayerId)).Event!;
        Assert.Equal(game.Guest.PlayerId, eliminated.Question.OwnerPlayerId);
        Assert.Equal("ACTIVE", eliminated.Question.Status);
        Assert.Equal(1, eliminated.Question.RoundId);
        var sharedQuestion = game.Manager.GetRetroRushSnapshot("host", game.SessionId).ActiveQuestion!;
        Assert.Equal(eliminated.Question.QuestionId, sharedQuestion.QuestionId);
        Assert.Equal(eliminated.Question.Prompt, sharedQuestion.Prompt);
        Assert.Equal(game.Guest.PlayerId, sharedQuestion.OwnerPlayerId);
        Assert.Equal(sharedQuestion, game.Manager.GetRetroRushSnapshot("guest", game.SessionId).ActiveQuestion);
        Assert.Null(game.Manager.RequestRetroRushPlayerElimination("guest", new(game.SessionId, 1, game.Guest.PlayerId)).Event);
        game.Manager.Disconnect("guest");
        game.Manager.Attach(game.Host.RoomCode, game.Guest.PlayerId, game.Guest.ReconnectToken, "guest-question-reconnected");
        Assert.Equal(sharedQuestion, game.Manager.GetRetroRushSnapshot("guest-question-reconnected", game.SessionId).ActiveQuestion);
        Assert.Throws<RoomException>(() => game.Manager.CompleteRetroRushQuestion("host", new(game.SessionId, 1, eliminated.Question.QuestionId)));

        var restarted = game.Manager.CompleteRetroRushQuestion("guest-question-reconnected", new(game.SessionId, 1, eliminated.Question.QuestionId)).Event!;
        Assert.Equal(2, restarted.RoundId);
        Assert.NotEqual(game.InitialSeed, restarted.MapSeed);
        Assert.Equal("COUNTDOWN", restarted.Phase);
        Assert.Empty(restarted.CollectedPickupIds);
        Assert.Empty(restarted.ActiveRockets);
        Assert.All(restarted.Players, player => Assert.Empty(player.OwnedAbilityIds));
        Assert.All(restarted.Players, player => Assert.Equal("ACTIVE", player.MovementState));
        Assert.All(restarted.Players, player =>
        {
            Assert.Equal(180, player.X);
            Assert.Equal(540, player.Y);
        });
        Assert.Equal(2, restarted.Players.Count);
        game.Clock.Advance(TimeSpan.FromMilliseconds(3_501));
        var firstRoundTwoUpdate = PlayerUpdate(game, game.Host.PlayerId, sequence: 1, x: 260, roundId: 2);
        Assert.NotNull(game.Manager.UpdateRetroRushPlayer("host", firstRoundTwoUpdate).Event);
        Assert.Throws<RoomException>(() => game.Manager.UpdateRetroRushPlayer("host", firstRoundTwoUpdate with { RoundId = 1, Sequence = 999 }));
        Assert.Throws<RoomException>(() => game.Manager.CompleteRetroRushQuestion("guest-question-reconnected", new(game.SessionId, 1, eliminated.Question.QuestionId)));
    }

    [Fact]
    public void DisconnectAndReconnectPreservePlayerIdWithoutDuplicatingEntity()
    {
        var game = StartGame(running: true);
        game.Manager.UpdateRetroRushPlayer(
            "guest", PlayerUpdate(game, game.Guest.PlayerId, sequence: 1, x: 420));
        game.Manager.RequestRetroRushPickupCollection(
            "guest", new(game.SessionId, 1, "chunk-1-ability-upper-platform-pickup-0", "rocket"));
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
        Assert.Contains("rocket", guest.OwnedAbilityIds);
    }

    private static UpdateRetroRushPlayerRequest PlayerUpdate(Game game, string playerId, long sequence, double x, int roundId = 1) =>
        new(game.SessionId, playerId, roundId, x, 540, 10, 0, "right", "ACTIVE", "running", sequence, 1000 + sequence);

    private static Game StartGame(bool running = false, int extraPlayerCount = 0)
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
        if (running) clock.Advance(TimeSpan.FromMilliseconds(3_501));
        return new(manager, clock, host, guest, room, room.CurrentGameSession!.GameSessionId, room.CurrentGameSession.Seed);
    }

    private sealed record Game(
        RoomManager Manager, MutableTimeProvider Clock, RoomAdmission Host, RoomAdmission Guest,
        RoomSnapshot Room, string SessionId, int InitialSeed);

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
