using Retrospective.Server.Contracts;
using Retrospective.Server.Rooms;
using Retrospective.Server.Rooms.HideSeek;
using Xunit;

namespace Retrospective.Server.Tests.HideSeek;

public sealed class HideSeekGameTests
{
    /// <summary>A 10x3 corridor: one floor row, walled on both ends and top/bottom. One hider spawn at the far (right) end.</summary>
    private static HideSeekMap BuildCorridorMap() => HideSeekMap.Parse(
        """{"id":"test","width":10,"height":3,"tileSize":20,"rows":["1111111111","1000000001","1111111111"],"seekerSpawn":{"x":1,"y":1},"hiderSpawns":[{"x":8,"y":1}]}""");

    /// <summary>Two sealed 3x3 rooms (cols 1-3 and cols 5-7) with no doorway between them — a wall at col 4 blocks any line of sight.</summary>
    private static HideSeekMap BuildTwoSealedRoomsMap() => HideSeekMap.Parse(
        """{"id":"test","width":9,"height":5,"tileSize":20,"rows":["111111111","100010001","100010001","100010001","111111111"],"seekerSpawn":{"x":2,"y":2},"hiderSpawns":[{"x":3,"y":2},{"x":6,"y":2}]}""");

    /// <summary>One open room; the seeker and one hider spawn on adjacent tiles (20px apart — inside CatchRadiusPx) so contact starts the instant DARK begins, with no movement needed.</summary>
    private static HideSeekMap BuildAdjacentSpawnMap() => HideSeekMap.Parse(
        """{"id":"test","width":6,"height":4,"tileSize":20,"rows":["111111","100001","100001","111111"],"seekerSpawn":{"x":1,"y":1},"hiderSpawns":[{"x":2,"y":1}]}""");

    /// <summary>Same room, but a second hider spawns far enough away (x=4) to stay out of catch range while the first (x=2, adjacent) gets caught.</summary>
    private static HideSeekMap BuildAdjacentSpawnMapWithASecondFarHider() => HideSeekMap.Parse(
        """{"id":"test","width":7,"height":4,"tileSize":20,"rows":["1111111","1000001","1000001","1111111"],"seekerSpawn":{"x":1,"y":1},"hiderSpawns":[{"x":2,"y":1},{"x":5,"y":1}]}""");

    /// <summary>Returns pre-scripted values in order — enough to cover seeker selection plus one shuffle key per hider spawn.</summary>
    private sealed class SequentialRoomRandom(params int[] values) : IRoomRandom
    {
        private int _index;
        public int Next(int maximumExclusive) => values[_index++] % maximumExclusive;
        public int Next(int minimumInclusive, int maximumExclusive) => minimumInclusive + values[_index++] % (maximumExclusive - minimumInclusive);
    }

    private sealed class MutableTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
        public void Advance(TimeSpan amount) => now += amount;
    }

    [Fact]
    public void StartAssignsExactlyOneSeekerAndSpawnsEveryoneAtTheirTileCenter()
    {
        var map = BuildCorridorMap();
        // Next(3) -> values[0]%3 = 1 -> roster[1] ("p2") is the seeker. Next(int.MaxValue) for the single hider-spawn shuffle key.
        var game = new HideSeekGame("ROOM1", map, [("p1", "c1"), ("p2", "c2"), ("p3", null)], new SequentialRoomRandom(1, 0), TimeProvider.System);
        Assert.Equal("p2", game.SeekerPlayerId);

        var tick = game.Tick(0);
        Assert.Equal(3, tick.Players.Count);
        var seeker = tick.Players.Single(p => p.PlayerId == "p2");
        Assert.Equal(30, seeker.Snapshot.X); // (1 + 0.5) * 20 — the map's seekerSpawn tile
        Assert.Equal(30, seeker.Snapshot.Y);
        var hider = tick.Players.Single(p => p.PlayerId == "p1");
        Assert.Equal(170, hider.Snapshot.X); // (8 + 0.5) * 20 — the map's one hiderSpawn tile
    }

    [Fact]
    public void MovesTowardHeldInputAndStopsDeadAtAWall()
    {
        var map = BuildCorridorMap();
        // roster.Count = 2 -> Next(2) = values[0]%2 = 0 -> roster[0] ("seeker") is the seeker.
        var game = new HideSeekGame("ROOM1", map, [("seeker", "c1"), ("hider", "c2")], new SequentialRoomRandom(0, 0), TimeProvider.System);
        game.SetInput("hider", new HideAndSeekInputRequest(Up: false, Down: false, Left: true, Right: false, Seq: 1));

        HideSeekTickResult? last = null;
        for (var i = 0; i < 500; i++) last = game.Tick(1.0 / HideSeekConfig.TickRate); // far more than enough to cross the corridor

        var hiderX = last!.Players.Single(p => p.PlayerId == "hider").Snapshot.X;
        Assert.True(hiderX < 170, "should have moved left from its 170px spawn");
        Assert.True(hiderX >= 20 + HideSeekConfig.PlayerRadius - 0.001, "should never cross into the wall tile at world x < 20");
    }

    [Fact]
    public void IgnoresAStaleOrDuplicateInputSequenceNumber()
    {
        var map = BuildCorridorMap();
        var game = new HideSeekGame("ROOM1", map, [("seeker", "c1"), ("hider", "c2")], new SequentialRoomRandom(0, 0), TimeProvider.System);
        game.SetInput("hider", new HideAndSeekInputRequest(false, false, true, false, Seq: 5));
        game.SetInput("hider", new HideAndSeekInputRequest(false, false, false, false, Seq: 3)); // older seq — must not clear the held left

        var hiderX = game.Tick(1.0 / HideSeekConfig.TickRate).Players.Single(p => p.PlayerId == "hider").Snapshot.X;
        Assert.True(hiderX < 170, "the stale seq=3 should not have overridden seq=5's held left");
    }

    [Fact]
    public void FreezesInPlaceOnceDisconnectedEvenWithInputStillHeld()
    {
        var map = BuildCorridorMap();
        var game = new HideSeekGame("ROOM1", map, [("seeker", "c1"), ("hider", "c2")], new SequentialRoomRandom(0, 0), TimeProvider.System);
        game.SetInput("hider", new HideAndSeekInputRequest(false, false, true, false, Seq: 1));
        for (var i = 0; i < 10; i++) game.Tick(1.0 / HideSeekConfig.TickRate); // let it actually move first

        var positionAtDisconnect = game.Tick(1.0 / HideSeekConfig.TickRate).Players.Single(p => p.PlayerId == "hider").Snapshot.X;
        game.SetConnected("hider", null, connected: false);

        var afterOneMoreTick = game.Tick(1.0 / HideSeekConfig.TickRate).Players.Single(p => p.PlayerId == "hider");
        Assert.Null(afterOneMoreTick.ConnectionId);
        Assert.Equal(positionAtDisconnect, afterOneMoreTick.Snapshot.X);
    }

    [Fact]
    public void RemovingAPlayerDropsThemFromFutureTicksAndTracksWhenTheRoomIsEmpty()
    {
        var map = BuildCorridorMap();
        var game = new HideSeekGame("ROOM1", map, [("seeker", "c1"), ("hider", "c2")], new SequentialRoomRandom(0, 0), TimeProvider.System);

        game.RemovePlayer("hider");
        Assert.Single(game.Tick(0).Players);
        Assert.True(game.HasPlayers());

        game.RemovePlayer("seeker");
        Assert.False(game.HasPlayers());
    }

    [Fact]
    public void TicksOmitPlayersOnTheOtherSideOfAWallFromEachOthersVisiblePlayers()
    {
        var map = BuildTwoSealedRoomsMap();
        // seekerIndex = values[0]%3 = 0 -> roster[0] ("seeker"). Then two
        // shuffle keys (values[1], values[2]) for the two hider spawns, kept
        // in order (0 < 1) so hiderSpawns[0] (same room) goes to the first
        // hider in roster order ("hiderNear") and hiderSpawns[1] (other room)
        // goes to the second ("hiderFar").
        var game = new HideSeekGame("ROOM1", map, [("seeker", "c0"), ("hiderNear", "c1"), ("hiderFar", "c2")], new SequentialRoomRandom(0, 0, 1), TimeProvider.System);

        var tick = game.Tick(0);
        var seekerVisible = tick.Players.Single(p => p.PlayerId == "seeker").Snapshot.VisiblePlayers.Select(v => v.PlayerId).ToArray();
        var hiderNearVisible = tick.Players.Single(p => p.PlayerId == "hiderNear").Snapshot.VisiblePlayers.Select(v => v.PlayerId).ToArray();
        var hiderFarVisible = tick.Players.Single(p => p.PlayerId == "hiderFar").Snapshot.VisiblePlayers.Select(v => v.PlayerId).ToArray();

        Assert.Contains("hiderNear", seekerVisible);
        Assert.DoesNotContain("hiderFar", seekerVisible);
        Assert.Contains("seeker", hiderNearVisible);
        Assert.DoesNotContain("hiderFar", hiderNearVisible);
        Assert.Empty(hiderFarVisible); // sealed alone in the other room — sees no one
    }

    [Fact]
    public void SeekerIsFrozenDuringPrepButFreeToMoveOnceDarkStarts()
    {
        var clock = new MutableTimeProvider(DateTimeOffset.Parse("2026-08-28T00:00:00Z"));
        var map = BuildCorridorMap();
        var game = new HideSeekGame("ROOM1", map, [("seeker", "c1"), ("hider", "c2")], new SequentialRoomRandom(0, 0), clock);
        game.SetInput("seeker", new HideAndSeekInputRequest(false, false, false, true, Seq: 1));

        for (var i = 0; i < 5; i++) game.Tick(1.0 / HideSeekConfig.TickRate);
        var seekerXDuringPrep = game.Tick(0).Players.Single(p => p.PlayerId == "seeker").Snapshot.X;
        Assert.Equal(30, seekerXDuringPrep); // (1 + 0.5) * 20 — frozen at spawn throughout PREP

        clock.Advance(TimeSpan.FromSeconds(HideSeekConfig.PrepDurationSec));
        var afterPrepTick = game.Tick(1.0 / HideSeekConfig.TickRate);
        Assert.Equal("DARK", afterPrepTick.UpdatedPublicState?.Phase);
        var seekerXInDark = afterPrepTick.Players.Single(p => p.PlayerId == "seeker").Snapshot.X;
        Assert.True(seekerXInDark > 30, "the seeker should be free to move the instant DARK starts");
    }

    [Fact]
    public void RevealPhaseShowsEveryoneToEveryoneRegardlessOfWalls()
    {
        var clock = new MutableTimeProvider(DateTimeOffset.Parse("2026-08-28T00:00:00Z"));
        var map = BuildTwoSealedRoomsMap();
        var game = new HideSeekGame("ROOM1", map, [("seeker", "c0"), ("hiderNear", "c1"), ("hiderFar", "c2")], new SequentialRoomRandom(0, 0, 1), clock);

        clock.Advance(TimeSpan.FromSeconds(HideSeekConfig.PrepDurationSec + HideSeekConfig.DarkDurationSec));
        var tick = game.Tick(0);
        Assert.Equal("REVEAL", tick.UpdatedPublicState?.Phase);

        var seekerVisible = tick.Players.Single(p => p.PlayerId == "seeker").Snapshot.VisiblePlayers.Select(v => v.PlayerId).ToArray();
        Assert.Contains("hiderFar", seekerVisible); // normally sealed off by the wall — REVEAL bypasses the filter for everyone
    }

    [Fact]
    public void CyclesThroughDarkAndRevealThreeTimesThenEndsExactlyOnSchedule()
    {
        var clock = new MutableTimeProvider(DateTimeOffset.Parse("2026-08-28T00:00:00Z"));
        var map = BuildCorridorMap();
        var game = new HideSeekGame("ROOM1", map, [("seeker", "c1"), ("hider", "c2")], new SequentialRoomRandom(0, 0), clock);

        string PhaseAfterAdvancing(int seconds)
        {
            clock.Advance(TimeSpan.FromSeconds(seconds));
            return game.Tick(0).UpdatedPublicState?.Phase ?? "(unchanged)";
        }

        // PREP(10) -> DARK(45) -> REVEAL(15), three full cycles, then ENDED —
        // 10 + 3*(45+15) = 190s total, matching HideSeekConfig.GameDurationSec.
        Assert.Equal("DARK", PhaseAfterAdvancing(HideSeekConfig.PrepDurationSec));
        Assert.Equal("REVEAL", PhaseAfterAdvancing(HideSeekConfig.DarkDurationSec));
        Assert.Equal("DARK", PhaseAfterAdvancing(HideSeekConfig.RevealDurationSec));
        Assert.Equal("REVEAL", PhaseAfterAdvancing(HideSeekConfig.DarkDurationSec));
        Assert.Equal("DARK", PhaseAfterAdvancing(HideSeekConfig.RevealDurationSec));
        Assert.Equal("REVEAL", PhaseAfterAdvancing(HideSeekConfig.DarkDurationSec));
        Assert.Equal("ENDED", PhaseAfterAdvancing(HideSeekConfig.RevealDurationSec));
    }

    [Fact]
    public void CatchesAHiderAfterTwoSecondsOfUninterruptedContact()
    {
        var clock = new MutableTimeProvider(DateTimeOffset.Parse("2026-08-28T00:00:00Z"));
        var map = BuildAdjacentSpawnMap();
        var game = new HideSeekGame("ROOM1", map, [("seeker", "c1"), ("hider", "c2")], new SequentialRoomRandom(0, 0), clock);
        clock.Advance(TimeSpan.FromSeconds(HideSeekConfig.PrepDurationSec)); // into DARK — PREP never processes catches

        var almostCaught = game.Tick(HideSeekConfig.CatchDurationSec - 0.1);
        Assert.Empty(almostCaught.NewCatches);
        var hiderTick = almostCaught.Players.Single(p => p.PlayerId == "hider");
        Assert.False(hiderTick.Snapshot.IsSpectator);
        Assert.True(hiderTick.Snapshot.CatchProgress is > 0.9 and < 1);

        var caughtTick = game.Tick(0.2); // crosses the 2.0s threshold
        Assert.Single(caughtTick.NewCatches);
        var caughtEvent = caughtTick.NewCatches[0];
        Assert.Equal("hider", caughtEvent.PlayerId);
        Assert.Equal("seeker", caughtEvent.SeekerPlayerId);
        Assert.Equal(0, caughtEvent.RemainingActiveHiders);
    }

    [Fact]
    public void ABriefLossOfContactWithinTheGraceWindowDoesNotResetCatchProgress()
    {
        var clock = new MutableTimeProvider(DateTimeOffset.Parse("2026-08-28T00:00:00Z"));
        var map = BuildAdjacentSpawnMap();
        var game = new HideSeekGame("ROOM1", map, [("seeker", "c1"), ("hider", "c2")], new SequentialRoomRandom(0, 0), clock);
        clock.Advance(TimeSpan.FromSeconds(HideSeekConfig.PrepDurationSec));

        game.Tick(1.0); // 1.0s of contact banked, both still stationary 20px apart

        // Hider steps away far enough to break contact (20px -> 34px), held just one tick.
        game.SetInput("hider", new HideAndSeekInputRequest(false, false, false, true, Seq: 1));
        var brokenContact = game.Tick(0.1); // moves ~14px right; grace ticks down from 0.3 to 0.2, contact NOT reset
        Assert.True(brokenContact.Players.Single(p => p.PlayerId == "hider").Snapshot.CatchProgress is > 0.4 and < 0.6);

        // Steps back within the grace window (well under CatchGraceSec).
        game.SetInput("hider", new HideAndSeekInputRequest(false, false, true, false, Seq: 2));
        game.Tick(0.1); // back within range; contact resumes from 1.0s, now 1.1s

        var caughtTick = game.Tick(0.9); // 1.1 + 0.9 = 2.0s total — never reset despite the brief gap
        Assert.Single(caughtTick.NewCatches);
    }

    [Fact]
    public void ALossOfContactPastTheGraceWindowResetsCatchProgress()
    {
        var clock = new MutableTimeProvider(DateTimeOffset.Parse("2026-08-28T00:00:00Z"));
        var map = BuildAdjacentSpawnMap();
        var game = new HideSeekGame("ROOM1", map, [("seeker", "c1"), ("hider", "c2")], new SequentialRoomRandom(0, 0), clock);
        clock.Advance(TimeSpan.FromSeconds(HideSeekConfig.PrepDurationSec));

        game.Tick(1.5); // well past halfway
        game.SetInput("hider", new HideAndSeekInputRequest(false, false, false, true, Seq: 1));
        game.Tick(0.1); // breaks contact

        var afterGraceExpires = game.Tick(HideSeekConfig.CatchGraceSec + 0.1); // stays out of range past the 0.3s grace
        Assert.Equal(0, afterGraceExpires.Players.Single(p => p.PlayerId == "hider").Snapshot.CatchProgress);
    }

    [Fact]
    public void CaughtHiderBecomesASpectatorWhoSeesEveryoneRegardlessOfWalls()
    {
        var clock = new MutableTimeProvider(DateTimeOffset.Parse("2026-08-28T00:00:00Z"));
        var map = BuildTwoSealedRoomsMap();
        var game = new HideSeekGame("ROOM1", map, [("seeker", "c0"), ("hiderNear", "c1"), ("hiderFar", "c2")], new SequentialRoomRandom(0, 0, 1), clock);
        clock.Advance(TimeSpan.FromSeconds(HideSeekConfig.PrepDurationSec));

        game.Tick(HideSeekConfig.CatchDurationSec); // hiderNear (adjacent to the seeker) gets caught in one jump
        var afterCatch = game.Tick(0);
        var hiderNearTick = afterCatch.Players.Single(p => p.PlayerId == "hiderNear");
        Assert.True(hiderNearTick.Snapshot.IsSpectator);
        var visibleIds = hiderNearTick.Snapshot.VisiblePlayers.Select(v => v.PlayerId).ToArray();
        Assert.Contains("hiderFar", visibleIds); // sealed off from everyone else — a spectator still sees them

        // The seeker was standing right on top of hiderNear when the catch
        // landed — without the Caught filter, hiderNear's now-frozen body
        // would still show up in the seeker's VisiblePlayers every tick.
        var seekerVisible = afterCatch.Players.Single(p => p.PlayerId == "seeker").Snapshot.VisiblePlayers.Select(v => v.PlayerId).ToArray();
        Assert.DoesNotContain("hiderNear", seekerVisible);

        // A spectator can't move — input is simply ineffective now.
        var xBeforeInput = hiderNearTick.Snapshot.X;
        game.SetInput("hiderNear", new HideAndSeekInputRequest(false, false, false, true, Seq: 1));
        var afterInput = game.Tick(1.0).Players.Single(p => p.PlayerId == "hiderNear").Snapshot.X;
        Assert.Equal(xBeforeInput, afterInput);
    }

    [Fact]
    public void CatchingEveryHiderEndsTheRoundWithTheSeekerAsWinner()
    {
        var clock = new MutableTimeProvider(DateTimeOffset.Parse("2026-08-28T00:00:00Z"));
        var map = BuildAdjacentSpawnMap();
        var game = new HideSeekGame("ROOM1", map, [("seeker", "c1"), ("hider", "c2")], new SequentialRoomRandom(0, 0), clock);
        clock.Advance(TimeSpan.FromSeconds(HideSeekConfig.PrepDurationSec));

        game.Tick(HideSeekConfig.CatchDurationSec);
        var state = game.GetPublicSnapshot();
        Assert.Equal("ENDED", state.Phase);
        Assert.Equal("SEEKER", state.Winner);
        Assert.Equal(["hider"], state.CaughtPlayerIds);
    }

    [Fact]
    public void CatchingOneOfTwoHidersLeavesTheRoundRunningWithOneStillActive()
    {
        var clock = new MutableTimeProvider(DateTimeOffset.Parse("2026-08-28T00:00:00Z"));
        var map = BuildAdjacentSpawnMapWithASecondFarHider();
        var game = new HideSeekGame("ROOM1", map, [("seeker", "c0"), ("hiderNear", "c1"), ("hiderFar", "c2")], new SequentialRoomRandom(0, 0, 1), clock);
        clock.Advance(TimeSpan.FromSeconds(HideSeekConfig.PrepDurationSec));

        var tick = game.Tick(HideSeekConfig.CatchDurationSec);
        Assert.Single(tick.NewCatches);
        Assert.Equal(1, tick.NewCatches[0].RemainingActiveHiders);
        Assert.NotEqual("ENDED", game.GetPublicSnapshot().Phase);
    }

    [Fact]
    public void RunningOutTheClockWithASurvivorEndsTheRoundWithHidersAsWinner()
    {
        var clock = new MutableTimeProvider(DateTimeOffset.Parse("2026-08-28T00:00:00Z"));
        var map = BuildCorridorMap(); // seeker and hider spawn far apart — never make contact
        var game = new HideSeekGame("ROOM1", map, [("seeker", "c1"), ("hider", "c2")], new SequentialRoomRandom(0, 0), clock);

        clock.Advance(TimeSpan.FromSeconds(HideSeekConfig.PrepDurationSec + HideSeekConfig.GameDurationSec));
        var tick = game.Tick(0);

        Assert.Equal("ENDED", tick.UpdatedPublicState?.Phase);
        Assert.Equal("HIDERS", tick.UpdatedPublicState?.Winner);
    }

    [Fact]
    public void TheSeekerLeavingEndsTheRoundImmediatelyInTheHidersFavor()
    {
        var map = BuildCorridorMap();
        var game = new HideSeekGame("ROOM1", map, [("seeker", "c1"), ("hider", "c2")], new SequentialRoomRandom(0, 0), TimeProvider.System);

        game.RemovePlayer("seeker");

        var state = game.GetPublicSnapshot();
        Assert.Equal("ENDED", state.Phase);
        Assert.Equal("HIDERS", state.Winner);
    }

    [Fact]
    public void AHiderWhoReconnectsWithinTenSecondsKeepsPlaying()
    {
        var clock = new MutableTimeProvider(DateTimeOffset.Parse("2026-08-28T00:00:00Z"));
        var map = BuildCorridorMap();
        var game = new HideSeekGame("ROOM1", map, [("seeker", "c1"), ("h1", "c2"), ("h2", "c3"), ("h3", "c4")], new SequentialRoomRandom(0, 0), clock);

        game.SetConnected("h1", null, connected: false);
        clock.Advance(TimeSpan.FromSeconds(HideSeekConfig.DisconnectGraceSec - 1));
        Assert.Contains(game.Tick(0).Players, p => p.PlayerId == "h1"); // still within the 10s window

        game.SetConnected("h1", "new-connection", connected: true); // reconnects, clearing the deadline
        clock.Advance(TimeSpan.FromSeconds(HideSeekConfig.DisconnectGraceSec + 5)); // well past what the old deadline would have been
        Assert.Contains(game.Tick(0).Players, p => p.PlayerId == "h1");
    }

    [Fact]
    public void AHiderWhoFailsToReconnectIsDroppedNeutrallyWithoutEndingAStillPlayableRound()
    {
        var clock = new MutableTimeProvider(DateTimeOffset.Parse("2026-08-28T00:00:00Z"));
        var map = BuildCorridorMap();
        var game = new HideSeekGame("ROOM1", map, [("seeker", "c1"), ("h1", "c2"), ("h2", "c3"), ("h3", "c4")], new SequentialRoomRandom(0, 0), clock);

        game.SetConnected("h1", null, connected: false);
        clock.Advance(TimeSpan.FromSeconds(HideSeekConfig.DisconnectGraceSec + 0.1));
        var tick = game.Tick(0);

        Assert.DoesNotContain(tick.Players, p => p.PlayerId == "h1");
        Assert.DoesNotContain("h1", game.GetPublicSnapshot().CaughtPlayerIds); // dropped, not caught
        Assert.NotEqual("ENDED", game.GetPublicSnapshot().Phase); // 3 players remain — still playable (== MinPlayers)
    }

    [Fact]
    public void TheSeekerFailingToReconnectEndsTheRoundInTheHidersFavor()
    {
        var clock = new MutableTimeProvider(DateTimeOffset.Parse("2026-08-28T00:00:00Z"));
        var map = BuildCorridorMap();
        var game = new HideSeekGame("ROOM1", map, [("seeker", "c1"), ("hider", "c2")], new SequentialRoomRandom(0, 0), clock);

        game.SetConnected("seeker", null, connected: false);
        clock.Advance(TimeSpan.FromSeconds(HideSeekConfig.DisconnectGraceSec + 0.1));
        game.Tick(0);

        var state = game.GetPublicSnapshot();
        Assert.Equal("ENDED", state.Phase);
        Assert.Equal("HIDERS", state.Winner);
    }

    [Fact]
    public void TheRoundEndsWhenHeadcountFallsBelowMinPlayers()
    {
        var map = BuildCorridorMap();
        var game = new HideSeekGame("ROOM1", map, [("seeker", "c1"), ("h1", "c2"), ("h2", "c3")], new SequentialRoomRandom(0, 0), TimeProvider.System);

        game.RemovePlayer("h1"); // 2 players remain, below MinPlayers(3)

        var state = game.GetPublicSnapshot();
        Assert.Equal("ENDED", state.Phase);
        Assert.Equal("HIDERS", state.Winner);
    }
}
