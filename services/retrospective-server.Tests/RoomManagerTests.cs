using Microsoft.Extensions.Options;
using Retrospective.Server.Contracts;
using Retrospective.Server.Rooms;

namespace Retrospective.Server.Tests;

public sealed class RoomManagerTests
{
    private static readonly string[] Games = ["retro-rush", "spin-the-bottle"];

    [Fact]
    public void CreateJoinAndReconnectKeepStableIdentityAndDeriveHost()
    {
        var manager = CreateManager();
        var host = manager.Create(CreateRequest("Host"));
        var guest = manager.Join(host.RoomCode, new JoinRoomRequest("Guest", "#123456"));

        var hostRoom = manager.Attach(host.RoomCode, host.PlayerId, host.ReconnectToken, "host-connection");
        var guestRoom = manager.Attach(host.RoomCode, guest.PlayerId, guest.ReconnectToken, "guest-connection");

        Assert.True(hostRoom.Players.Single(player => player.Id == host.PlayerId).IsHost);
        Assert.False(guestRoom.Players.Single(player => player.Id == guest.PlayerId).IsHost);
        Assert.Equal(host.PlayerId, guestRoom.HostPlayerId);
        Assert.Throws<RoomException>(() => manager.Attach(host.RoomCode, guest.PlayerId, "wrong-token", "attacker"));
    }

    [Fact]
    public void NewestDuplicateConnectionWins()
    {
        var manager = CreateManager();
        var host = manager.Create(CreateRequest("Host"));
        manager.Attach(host.RoomCode, host.PlayerId, host.ReconnectToken, "old");
        manager.Attach(host.RoomCode, host.PlayerId, host.ReconnectToken, "new");

        Assert.Throws<RoomException>(() => manager.AuthenticateConnection("old"));
        Assert.Equal(host.PlayerId, manager.AuthenticateConnection("new").PlayerId);
    }

    [Fact]
    public void HostSelectedDurationStartsOneSharedDeadlineWhenSelectionOpens()
    {
        var startedAt = DateTimeOffset.Parse("2026-08-11T12:00:00Z");
        var clock = new MutableTimeProvider(startedAt);
        var manager = CreateManager(clock);
        var host = manager.Create(CreateRequest("Host", votingTimeSeconds: 45));
        var guest = manager.Join(host.RoomCode, new JoinRoomRequest("Guest", "#123456"));
        manager.Attach(host.RoomCode, host.PlayerId, host.ReconnectToken, "host");
        manager.Attach(host.RoomCode, guest.PlayerId, guest.ReconnectToken, "guest");

        Assert.Equal(45, host.Room.VotingTimeSeconds);
        Assert.Throws<RoomException>(() => manager.BeginGameSelection("guest", Games));
        var opened = manager.BeginGameSelection("host", Games);

        Assert.Equal("GAME_SELECTION", opened.Status);
        Assert.Equal(45, opened.VotingTimeSeconds);
        Assert.Equal(startedAt.ToUnixTimeMilliseconds(), opened.VotingStartedAt);
        Assert.Equal(startedAt.AddSeconds(45).ToUnixTimeMilliseconds(), opened.VotingEndsAt);
        Assert.Equal(Games, opened.CandidateGameIds);
        Assert.Empty(opened.Votes);
    }

    [Fact]
    public void RepeatedOpenLateJoinAndReconnectDoNotRestartDeadline()
    {
        var clock = new MutableTimeProvider(DateTimeOffset.Parse("2026-08-11T12:00:00Z"));
        var manager = CreateManager(clock);
        var host = manager.Create(CreateRequest("Host"));
        manager.Attach(host.RoomCode, host.PlayerId, host.ReconnectToken, "host");
        var opened = manager.BeginGameSelection("host", Games);
        var deadline = opened.VotingEndsAt;

        clock.Advance(TimeSpan.FromSeconds(10));
        Assert.Equal(deadline, manager.BeginGameSelection("host", Games).VotingEndsAt);
        var lateGuest = manager.Join(host.RoomCode, new JoinRoomRequest("Late Guest", "#123456"));
        Assert.Equal(deadline, lateGuest.Room.VotingEndsAt);
        var reconnected = manager.Attach(host.RoomCode, host.PlayerId, host.ReconnectToken, "host-new");
        Assert.Equal(deadline, reconnected.VotingEndsAt);
        Assert.Equal(deadline, manager.Get(host.RoomCode)!.VotingEndsAt);
    }

    [Fact]
    public void TimeoutWaitsForDeadlineThenResolvesExactlyOnceAndCreatesActiveSession()
    {
        var clock = new MutableTimeProvider(DateTimeOffset.Parse("2026-08-11T12:00:00Z"));
        var manager = CreateManager(clock, new FixedRoomRandom(0));
        var host = manager.Create(CreateRequest("Host"));
        manager.Attach(host.RoomCode, host.PlayerId, host.ReconnectToken, "host");
        manager.BeginGameSelection("host", Games);
        manager.CastVote("host", "retro-rush");

        clock.Advance(TimeSpan.FromMilliseconds(29_999));
        Assert.Empty(manager.AdvanceTimedStates());
        Assert.Equal("GAME_SELECTION", manager.Get(host.RoomCode)!.Status);

        clock.Advance(TimeSpan.FromMilliseconds(1));
        var transition = Assert.Single(manager.AdvanceTimedStates());
        Assert.True(transition.GameStarted);
        Assert.Equal("PLAYING", transition.Snapshot.Status);
        Assert.Equal("retro-rush", transition.Snapshot.SelectedGameId);
        Assert.Equal("retro-rush", transition.Snapshot.CurrentGameSession!.GameId);
        Assert.Equal("ACTIVE", transition.Snapshot.CurrentGameSession.State);
        Assert.Null(transition.Snapshot.VotingStartedAt);
        Assert.Null(transition.Snapshot.VotingEndsAt);
        Assert.Empty(manager.AdvanceTimedStates());
        Assert.Equal(transition.Snapshot.SelectedGameId, manager.Get(host.RoomCode)!.SelectedGameId);
    }

    [Fact]
    public void EveryPlayerCanVoteAndHighestCountWinsWithoutTieBreak()
    {
        var manager = CreateManager();
        var host = manager.Create(CreateRequest("Host"));
        var first = manager.Join(host.RoomCode, new JoinRoomRequest("First", "#123456"));
        var second = manager.Join(host.RoomCode, new JoinRoomRequest("Second", "#abcdef"));
        manager.Attach(host.RoomCode, host.PlayerId, host.ReconnectToken, "host");
        manager.Attach(host.RoomCode, first.PlayerId, first.ReconnectToken, "first");
        manager.Attach(host.RoomCode, second.PlayerId, second.ReconnectToken, "second");
        manager.BeginGameSelection("host", Games);

        manager.CastVote("host", "retro-rush");
        manager.CastVote("first", "spin-the-bottle");
        manager.CastVote("first", "retro-rush");
        manager.CastVote("second", "spin-the-bottle");
        Assert.Throws<RoomException>(() => manager.ResolveVote("first"));
        var resolution = manager.ResolveVote("host");

        Assert.True(resolution.GameStarted);
        Assert.Equal("retro-rush", resolution.Snapshot.SelectedGameId);
        Assert.Null(resolution.Snapshot.TieBreak);
        Assert.Equal("retro-rush", resolution.Snapshot.Votes[first.PlayerId]);
    }

    [Fact]
    public void TieAndNoVotesUseOneServerRandomChoiceFromValidCandidates()
    {
        var tieManager = CreateManager(random: new FixedRoomRandom(1));
        var tieHost = tieManager.Create(CreateRequest("Host"));
        var tieGuest = tieManager.Join(tieHost.RoomCode, new JoinRoomRequest("Guest", "#123456"));
        tieManager.Attach(tieHost.RoomCode, tieHost.PlayerId, tieHost.ReconnectToken, "tie-host");
        tieManager.Attach(tieHost.RoomCode, tieGuest.PlayerId, tieGuest.ReconnectToken, "tie-guest");
        tieManager.BeginGameSelection("tie-host", Games);
        tieManager.CastVote("tie-host", "retro-rush");
        tieManager.CastVote("tie-guest", "spin-the-bottle");

        var tie = tieManager.ResolveVote("tie-host");
        Assert.Equal("spin-the-bottle", tie.Snapshot.SelectedGameId);
        Assert.Equal(Games, tie.Snapshot.TieBreak!.Candidates);
        Assert.Equal("spin-the-bottle", tie.Snapshot.TieBreak.Winner);
        Assert.False(tieManager.ResolveVote("tie-host").GameStarted);

        var emptyManager = CreateManager(random: new FixedRoomRandom(1));
        var emptyHost = emptyManager.Create(CreateRequest("Host"));
        emptyManager.Attach(emptyHost.RoomCode, emptyHost.PlayerId, emptyHost.ReconnectToken, "empty-host");
        emptyManager.BeginGameSelection("empty-host", Games);
        var noVotes = emptyManager.ResolveVote("empty-host");

        Assert.Equal("spin-the-bottle", noVotes.Snapshot.SelectedGameId);
        Assert.Contains(noVotes.Snapshot.SelectedGameId!, Games);
        Assert.Equal(noVotes.Snapshot.SelectedGameId, emptyManager.Get(emptyHost.RoomCode)!.SelectedGameId);
    }

    [Fact]
    public void ReturningFromGameStartsAFreshConfiguredSelectionWindow()
    {
        var clock = new MutableTimeProvider(DateTimeOffset.Parse("2026-08-11T12:00:00Z"));
        var manager = CreateManager(clock);
        var host = manager.Create(CreateRequest("Host", votingTimeSeconds: 15));
        manager.Attach(host.RoomCode, host.PlayerId, host.ReconnectToken, "host");
        manager.BeginGameSelection("host", Games);
        manager.CastVote("host", "retro-rush");
        manager.ResolveVote("host");

        clock.Advance(TimeSpan.FromMinutes(1));
        var reopened = manager.ReturnToGameSelection("host");

        Assert.Equal("GAME_SELECTION", reopened.Status);
        Assert.Equal(clock.GetUtcNow().ToUnixTimeMilliseconds(), reopened.VotingStartedAt);
        Assert.Equal(clock.GetUtcNow().AddSeconds(15).ToUnixTimeMilliseconds(), reopened.VotingEndsAt);
        Assert.Empty(reopened.Votes);
        Assert.Null(reopened.SelectedGameId);
    }

    [Fact]
    public void SpinQuestionStateRemainsAuthoritativeAfterVoteResolution()
    {
        var clock = new MutableTimeProvider(DateTimeOffset.Parse("2026-08-11T12:00:00Z"));
        var manager = CreateManager(clock, new FixedRoomRandom(1));
        var host = manager.Create(CreateRequest("Arda"));
        var target = manager.Join(host.RoomCode, new JoinRoomRequest("Ali", "#123456"));
        manager.Attach(host.RoomCode, host.PlayerId, host.ReconnectToken, "host");
        manager.Attach(host.RoomCode, target.PlayerId, target.ReconnectToken, "target");
        manager.BeginGameSelection("host", ["spin-the-bottle"]);
        clock.Advance(TimeSpan.FromSeconds(30));
        manager.AdvanceTimedStates();

        var spin = manager.Spin("host");
        Assert.Equal(target.PlayerId, spin.TargetPlayerId);
        Assert.Equal(host.PlayerId, spin.SpinnerPlayerId);
        var spinning = manager.Get(host.RoomCode)!.SpinBottleState!;
        Assert.Equal(spin.SpinId, spinning.SpinId);
        Assert.Equal(target.PlayerId, spinning.TargetPlayerId);

        clock.Advance(TimeSpan.FromMilliseconds(spin.DurationMs));
        var choice = Assert.Single(manager.AdvanceTimedStates()).Snapshot.SpinBottleState!;
        Assert.Equal("CHOICE", choice.Status);
        Assert.Throws<RoomException>(() => manager.ChooseSpinCategory("host", "\u0130\u015F", choice.Revision));

        var confirm = manager.ChooseSpinCategory("target", "\u0130\u015F", choice.Revision).SpinBottleState!;
        manager.ActivateSpinQuestion("target", confirm.Revision);
        clock.Advance(TimeSpan.FromMilliseconds(1800));
        var active = Assert.Single(manager.AdvanceTimedStates()).Snapshot.SpinBottleState!;
        Assert.Equal("QUESTION_ACTIVE", active.Status);
        Assert.NotNull(active.QuestionId);
        Assert.NotNull(active.QuestionText);

        Assert.Throws<RoomException>(() => manager.PassSpinQuestion("host", active.QuestionId!, active.Revision));
        var replacement = manager.PassSpinQuestion("target", active.QuestionId!, active.Revision).SpinBottleState!;
        Assert.NotEqual(active.QuestionId, replacement.QuestionId);
        Assert.Equal(active.TargetPlayerId, replacement.TargetPlayerId);
        Assert.Throws<RoomException>(() => manager.PassSpinQuestion("target", active.QuestionId!, active.Revision));

        var reconnected = manager.Attach(host.RoomCode, host.PlayerId, host.ReconnectToken, "host-new");
        Assert.Equal(replacement.QuestionId, reconnected.SpinBottleState!.QuestionId);
        var resolved = manager.CompleteSpinQuestion("target", replacement.QuestionId!, replacement.Revision).SpinBottleState!;
        Assert.Equal("RESOLVED", resolved.Status);
    }

    [Fact]
    public void HostTransfersAfterDisconnectGraceButNotBefore()
    {
        var clock = new MutableTimeProvider(DateTimeOffset.Parse("2026-08-11T00:00:00Z"));
        var manager = CreateManager(clock);
        var host = manager.Create(CreateRequest("Host"));
        var guest = manager.Join(host.RoomCode, new JoinRoomRequest("Guest", "#123456"));
        manager.Attach(host.RoomCode, host.PlayerId, host.ReconnectToken, "host");
        manager.Attach(host.RoomCode, guest.PlayerId, guest.ReconnectToken, "guest");
        manager.Disconnect("host");

        clock.Advance(TimeSpan.FromSeconds(24));
        Assert.Empty(manager.SweepDisconnected());
        Assert.Equal(host.PlayerId, manager.Get(host.RoomCode)!.HostPlayerId);

        clock.Advance(TimeSpan.FromSeconds(2));
        Assert.Single(manager.SweepDisconnected());
        Assert.Equal(guest.PlayerId, manager.Get(host.RoomCode)!.HostPlayerId);
    }

    private static RoomManager CreateManager(TimeProvider? timeProvider = null, IRoomRandom? random = null) => new(
        timeProvider ?? TimeProvider.System,
        Options.Create(new RoomOptions
        {
            DisconnectGraceSeconds = 25,
            QuestionLoadingMilliseconds = 1800,
        }),
        random ?? new FixedRoomRandom(0));

    private static CreateRoomRequest CreateRequest(string name, int votingTimeSeconds = 30) =>
        new(name, "#654321", "Sprint Retro", 10, 30, votingTimeSeconds);

    private sealed class MutableTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
        public void Advance(TimeSpan amount) => now += amount;
    }

    private sealed class FixedRoomRandom(int value) : IRoomRandom
    {
        public int Next(int maximumExclusive) => value % maximumExclusive;
        public int Next(int minimumInclusive, int maximumExclusive) =>
            minimumInclusive + value % (maximumExclusive - minimumInclusive);
    }
}
