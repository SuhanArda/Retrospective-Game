using Microsoft.Extensions.Options;
using Retrospective.Server.Contracts;
using Retrospective.Server.Rooms;

namespace Retrospective.Server.Tests;

public sealed class RoomManagerTests
{
    private static readonly string[] Games = ["retro-rush", "spin-the-bottle"];

    [Fact]
    public void AiAccessUsesRoomIdentityWithoutRequiringAnActiveGame()
    {
        var manager = CreateManager();
        var host = manager.Create(CreateRequest("Host"));
        var guest = manager.Join(host.RoomCode, new JoinRoomRequest("Guest", "#123456"));
        manager.Attach(host.RoomCode, host.PlayerId, host.ReconnectToken, "host");
        var access = manager.AuthorizeAiAccess(host.RoomCode, host.PlayerId, host.ReconnectToken, hostRequired: true);
        Assert.Equal(host.Room!.Id, access.RoomInstanceId);
        Assert.Equal(host.RoomCode, access.RoomCode);
        Assert.True(access.IsHost);
        Assert.Throws<RoomException>(() => manager.AuthorizeAiAccess(host.RoomCode, guest.PlayerId, guest.ReconnectToken, hostRequired: true));
        Assert.Throws<RoomException>(() => manager.AuthorizeAiAccess(host.RoomCode, host.PlayerId, "wrong", hostRequired: true));
    }

    [Fact]
    public void AiQuestionSourceIsRestoredFromRoomMemoryForTheNextGame()
    {
        var manager = CreateManager();
        var host = manager.Create(CreateRequest("Host"));
        var sourceFile = new ReportFilePayload("retro.txt", "text/plain", "cmV0cm8=");
        var initial = new GenerateRoomQuestionsRequest(
            "  ekip iletişimi  ",
            "  kararlar geç alındı  ",
            "tr",
            "düşündürücü",
            20,
            sourceFile);

        var remembered = manager.RememberOrRestoreAiQuestionSource(host.RoomCode, initial);
        var restored = manager.RememberOrRestoreAiQuestionSource(host.RoomCode,
            new GenerateRoomQuestionsRequest(null, null, "tr", "dengeli", 15));

        Assert.Equal("ekip iletişimi", remembered.Topic);
        Assert.Equal("kararlar geç alındı", remembered.ReportText);
        Assert.Equal(20, remembered.Count);
        Assert.Equal("ekip iletişimi", restored.Topic);
        Assert.Equal("kararlar geç alındı", restored.ReportText);
        Assert.Equal(sourceFile, restored.ReportFile);
        Assert.Equal("düşündürücü", restored.Style);
        Assert.Equal(15, restored.Count);
    }

    [Fact]
    public void GameTransitionsAndTemporaryDisconnectKeepRoomAiSource()
    {
        var manager = CreateManager();
        var host = manager.Create(CreateRequest("Host"));
        manager.Attach(host.RoomCode, host.PlayerId, host.ReconnectToken, "host");
        manager.RememberOrRestoreAiQuestionSource(host.RoomCode,
            new GenerateRoomQuestionsRequest("kediler", null, "tr", "dengeli"));

        manager.BeginGameSelection("host", ["spin-the-bottle"]);
        manager.ResolveVote("host");
        manager.ReturnToGameSelection("host");
        manager.Disconnect("host");

        var restored = manager.RememberOrRestoreAiQuestionSource(host.RoomCode,
            new GenerateRoomQuestionsRequest(null, null, "tr", "dengeli"));
        Assert.Equal("kediler", restored.Topic);
    }

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
        Assert.Equal(2, guestRoom.Players.Count);
        Assert.Equal(["Host", "Guest"], guestRoom.Players.Select(player => player.DisplayName));
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
    public void OneConnectionCannotReplaceAnotherPlayersMembershipMapping()
    {
        var manager = CreateManager();
        var host = manager.Create(CreateRequest("Host"));
        var guest = manager.Join(host.RoomCode, new JoinRoomRequest("Guest", "#123456"));
        manager.Attach(host.RoomCode, host.PlayerId, host.ReconnectToken, "shared");

        var error = Assert.Throws<RoomException>(() =>
            manager.Attach(host.RoomCode, guest.PlayerId, guest.ReconnectToken, "shared"));

        Assert.Equal("CONNECTION_ALREADY_ATTACHED", error.Code);
        Assert.Equal(host.PlayerId, manager.AuthenticateConnection("shared").PlayerId);
    }

    [Fact]
    public void DisconnectFromReplacedConnectionCannotMarkOrRemoveReconnectedPlayer()
    {
        var clock = new MutableTimeProvider(DateTimeOffset.Parse("2026-08-11T00:00:00Z"));
        var manager = CreateManager(clock);
        var host = manager.Create(CreateRequest("Host"));
        manager.Attach(host.RoomCode, host.PlayerId, host.ReconnectToken, "old");
        manager.Attach(host.RoomCode, host.PlayerId, host.ReconnectToken, "new");

        Assert.Null(manager.Disconnect("old"));
        clock.Advance(TimeSpan.FromMinutes(1));

        Assert.Empty(manager.SweepDisconnected());
        var player = Assert.Single(manager.Get(host.RoomCode)!.Players);
        Assert.True(player.IsConnected);
        Assert.Equal(host.PlayerId, manager.AuthenticateConnection("new").PlayerId);
    }

    [Fact]
    public void ReconnectBeforeExpiryCancelsPendingRemovalAndKeepsPlayerIdentity()
    {
        var clock = new MutableTimeProvider(DateTimeOffset.Parse("2026-08-11T00:00:00Z"));
        var manager = CreateManager(clock);
        var host = manager.Create(CreateRequest("Host"));
        var guest = manager.Join(host.RoomCode, new JoinRoomRequest("Guest", "#123456"));
        manager.Attach(host.RoomCode, host.PlayerId, host.ReconnectToken, "host");
        manager.Attach(host.RoomCode, guest.PlayerId, guest.ReconnectToken, "guest-old");

        var disconnected = manager.Disconnect("guest-old")!;
        Assert.False(disconnected.Players.Single(player => player.Id == guest.PlayerId).IsConnected);
        clock.Advance(TimeSpan.FromSeconds(24));

        var reconnected = manager.Attach(host.RoomCode, guest.PlayerId, guest.ReconnectToken, "guest-new");
        Assert.True(reconnected.Players.Single(player => player.Id == guest.PlayerId).IsConnected);
        Assert.Equal(guest.PlayerId, manager.AuthenticateConnection("guest-new").PlayerId);

        clock.Advance(TimeSpan.FromMinutes(1));
        Assert.Empty(manager.SweepDisconnected());
        Assert.Equal(guest.PlayerId, manager.Get(host.RoomCode)!.Players.Single(player => player.DisplayName == "Guest").Id);
    }

    [Fact]
    public void ExpiredDisconnectRemovesGuestButExplicitLeaveRemovesImmediately()
    {
        var clock = new MutableTimeProvider(DateTimeOffset.Parse("2026-08-11T00:00:00Z"));
        var manager = CreateManager(clock);
        var host = manager.Create(CreateRequest("Host"));
        var disconnectedGuest = manager.Join(host.RoomCode, new JoinRoomRequest("Disconnected", "#123456"));
        var leavingGuest = manager.Join(host.RoomCode, new JoinRoomRequest("Leaving", "#abcdef"));
        manager.Attach(host.RoomCode, host.PlayerId, host.ReconnectToken, "host");
        manager.Attach(host.RoomCode, disconnectedGuest.PlayerId, disconnectedGuest.ReconnectToken, "disconnected");
        manager.Attach(host.RoomCode, leavingGuest.PlayerId, leavingGuest.ReconnectToken, "leaving");

        var afterLeave = manager.Leave("leaving");
        Assert.DoesNotContain(afterLeave.Players, player => player.Id == leavingGuest.PlayerId);
        Assert.Throws<RoomException>(() => manager.AuthenticateConnection("leaving"));

        manager.Disconnect("disconnected");
        clock.Advance(TimeSpan.FromSeconds(25));
        var change = Assert.Single(manager.SweepDisconnected());

        Assert.DoesNotContain(change.Snapshot!.Players, player => player.Id == disconnectedGuest.PlayerId);
        Assert.Equal([host.PlayerId], change.Snapshot.Players.Select(player => player.Id));
        Assert.Throws<RoomException>(() => manager.AuthenticateConnection("disconnected"));
    }

    [Fact]
    public void AdmissionThatNeverAttachesDoesNotLeaveAnImmortalRoomMembership()
    {
        var clock = new MutableTimeProvider(DateTimeOffset.Parse("2026-08-11T00:00:00Z"));
        var manager = CreateManager(clock);
        var host = manager.Create(CreateRequest("Host"));

        clock.Advance(TimeSpan.FromSeconds(24));
        Assert.Empty(manager.SweepDisconnected());
        Assert.NotNull(manager.Get(host.RoomCode));

        clock.Advance(TimeSpan.FromSeconds(1));
        var change = Assert.Single(manager.SweepDisconnected());
        Assert.Null(change.Snapshot);
        Assert.Null(manager.Get(host.RoomCode));
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
    public void OnlyTheAuthoritativeHostCanReturnToGameSelection()
    {
        var manager = CreateManager();
        var host = manager.Create(CreateRequest("Host"));
        var guest = manager.Join(host.RoomCode, new JoinRoomRequest("Guest", "#123456"));
        manager.Attach(host.RoomCode, host.PlayerId, host.ReconnectToken, "host");
        manager.Attach(host.RoomCode, guest.PlayerId, guest.ReconnectToken, "guest");
        manager.BeginGameSelection("host", Games);
        manager.CastVote("host", "retro-rush");
        manager.ResolveVote("host");

        var rejection = Assert.Throws<RoomException>(() => manager.ReturnToGameSelection("guest"));
        Assert.Equal("HOST_REQUIRED", rejection.Code);

        var reopened = manager.ReturnToGameSelection("host");
        Assert.Equal("GAME_SELECTION", reopened.Status);
        Assert.Equal(host.PlayerId, reopened.HostPlayerId);
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

        var active = manager.ChooseSpinCategory("target", "\u0130\u015F", choice.Revision).SpinBottleState!;
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
    public void SpinTargetsAllTenPlayersWithEqualAngularSpacing()
    {
        var clock = new MutableTimeProvider(DateTimeOffset.Parse("2026-08-11T12:00:00Z"));
        var manager = CreateManager(clock, new FixedRoomRandom(9));
        var host = manager.Create(CreateRequest("Host"));
        var guests = Enumerable.Range(2, 9)
            .Select(index => manager.Join(host.RoomCode, new JoinRoomRequest($"Player {index}", "#123456")))
            .ToArray();
        manager.Attach(host.RoomCode, host.PlayerId, host.ReconnectToken, "host");
        manager.BeginGameSelection("host", ["spin-the-bottle"]);
        clock.Advance(TimeSpan.FromSeconds(30));
        manager.AdvanceTimedStates();

        var spin = manager.Spin("host");

        Assert.Equal(9, spin.TargetIndex);
        Assert.Equal(guests[^1].PlayerId, spin.TargetPlayerId);
        Assert.Equal(4 * 360 + 324, spin.FinalAngle);
    }

    [Fact]
    public void SpinSupportsAHostOnlyRoom()
    {
        var clock = new MutableTimeProvider(DateTimeOffset.Parse("2026-08-11T12:00:00Z"));
        var manager = CreateManager(clock, new FixedRoomRandom(0));
        var host = manager.Create(CreateRequest("Host"));
        manager.Attach(host.RoomCode, host.PlayerId, host.ReconnectToken, "host");
        manager.BeginGameSelection("host", ["spin-the-bottle"]);
        clock.Advance(TimeSpan.FromSeconds(30));
        manager.AdvanceTimedStates();

        var spin = manager.Spin("host");

        Assert.Equal(0, spin.TargetIndex);
        Assert.Equal(host.PlayerId, spin.TargetPlayerId);
        Assert.Equal(4 * 360, spin.FinalAngle);
    }

    [Fact]
    public void SpinRoundsEqualSpacingForSevenPlayers()
    {
        var clock = new MutableTimeProvider(DateTimeOffset.Parse("2026-08-11T12:00:00Z"));
        var manager = CreateManager(clock, new FixedRoomRandom(6));
        var host = manager.Create(CreateRequest("Host"));
        var guests = Enumerable.Range(2, 6)
            .Select(index => manager.Join(host.RoomCode, new JoinRoomRequest($"Player {index}", "#123456")))
            .ToArray();
        manager.Attach(host.RoomCode, host.PlayerId, host.ReconnectToken, "host");
        manager.BeginGameSelection("host", ["spin-the-bottle"]);
        clock.Advance(TimeSpan.FromSeconds(30));
        manager.AdvanceTimedStates();

        var spin = manager.Spin("host");

        Assert.Equal(6, spin.TargetIndex);
        Assert.Equal(guests[^1].PlayerId, spin.TargetPlayerId);
        Assert.Equal(4 * 360 + 309, spin.FinalAngle);
    }

    [Fact]
    public void RouletteStateIsAuthoritativeHiddenAndGatedByHolderAndTarget()
    {
        // FixedRoomRandom(0) always answers 0, so chamber pointer and bullet
        // chamber land on the same slot — the very first shot is a guaranteed
        // hit, which is exactly what this test needs to exercise the hit path.
        var manager = CreateManager(random: new FixedRoomRandom(0));
        var host = manager.Create(CreateRequest("Arda"));
        var target = manager.Join(host.RoomCode, new JoinRoomRequest("Ali", "#123456"));
        manager.Attach(host.RoomCode, host.PlayerId, host.ReconnectToken, "host");
        manager.Attach(host.RoomCode, target.PlayerId, target.ReconnectToken, "target");
        manager.BeginGameSelection("host", ["rus-ruleti"]);
        manager.CastVote("host", "rus-ruleti");
        manager.ResolveVote("host");

        var state = manager.Get(host.RoomCode)!.RussianRouletteState!;
        Assert.Equal("IDLE", state.Status);
        Assert.Equal(host.PlayerId, state.HolderPlayerId);

        Assert.Throws<RoomException>(() => manager.Fire("target", host.PlayerId));
        Assert.Throws<RoomException>(() => manager.Fire("host", host.PlayerId));

        var fire = manager.Fire("host", target.PlayerId);
        Assert.Equal(host.PlayerId, fire.ShooterPlayerId);
        Assert.Equal(target.PlayerId, fire.TargetPlayerId);
        Assert.True(fire.Hit);

        var afterFire = manager.Get(host.RoomCode)!.RussianRouletteState!;
        Assert.Equal("QUESTION_ACTIVE", afterFire.Status);
        Assert.Equal(host.PlayerId, afterFire.HolderPlayerId);
        Assert.NotNull(afterFire.QuestionText);
        Assert.Throws<RoomException>(() => manager.Fire("host", target.PlayerId));

        Assert.Throws<RoomException>(() => manager.CompleteFireQuestion("host", afterFire.Revision));
        var resolved = manager.CompleteFireQuestion("target", afterFire.Revision).RussianRouletteState!;
        Assert.Equal("IDLE", resolved.Status);
        Assert.Equal(target.PlayerId, resolved.HolderPlayerId);
        Assert.Null(resolved.QuestionText);
        Assert.Throws<RoomException>(() => manager.CompleteFireQuestion("target", afterFire.Revision));
    }

    [Fact]
    public void MissesSilentlyPassTheGunAndTheBulletIsGuaranteedWithinOneCylinder()
    {
        // Values, in consumption order: the single-candidate winner pick,
        // holder pick, chamber-count offset, bullet chamber (2), pointer
        // start (0) — giving two misses at pointer 0 and 1, a guaranteed hit
        // at pointer 2, then a fresh reload once the question is completed.
        var manager = CreateManager(random: new SequenceRoomRandom(0, 0, 0, 2, 0, 1, 3, 4));
        var host = manager.Create(CreateRequest("Arda"));
        var target = manager.Join(host.RoomCode, new JoinRoomRequest("Ali", "#123456"));
        manager.Attach(host.RoomCode, host.PlayerId, host.ReconnectToken, "host");
        manager.Attach(host.RoomCode, target.PlayerId, target.ReconnectToken, "target");
        manager.BeginGameSelection("host", ["rus-ruleti"]);
        manager.CastVote("host", "rus-ruleti");
        manager.ResolveVote("host");

        var first = manager.Fire("host", target.PlayerId);
        Assert.False(first.Hit);
        Assert.Equal(target.PlayerId, manager.Get(host.RoomCode)!.RussianRouletteState!.HolderPlayerId);

        var second = manager.Fire("target", host.PlayerId);
        Assert.False(second.Hit);
        Assert.Equal(host.PlayerId, manager.Get(host.RoomCode)!.RussianRouletteState!.HolderPlayerId);

        var third = manager.Fire("host", target.PlayerId);
        Assert.True(third.Hit);
        var hitState = manager.Get(host.RoomCode)!.RussianRouletteState!;
        // Holder does not change on a hit until the question is completed.
        Assert.Equal(host.PlayerId, hitState.HolderPlayerId);

        var reloaded = manager.CompleteFireQuestion("target", hitState.Revision).RussianRouletteState!;
        Assert.Equal(target.PlayerId, reloaded.HolderPlayerId);
    }

    [Fact]
    public void DrawAndGuessStateIsAuthoritativeHiddenAndScoresRankedGuesses()
    {
        // FixedRoomRandom(0) picks index 0 everywhere: the first-joined
        // player (host) draws first, and the word is always the list's
        // first entry ("kedi").
        var manager = CreateManager(random: new FixedRoomRandom(0));
        var host = manager.Create(CreateRequest("Arda"));
        var guest = manager.Join(host.RoomCode, new JoinRoomRequest("Ali", "#123456"));
        manager.Attach(host.RoomCode, host.PlayerId, host.ReconnectToken, "host");
        manager.Attach(host.RoomCode, guest.PlayerId, guest.ReconnectToken, "guest");
        manager.BeginGameSelection("host", ["draw-and-guess"]);
        manager.CastVote("host", "draw-and-guess");
        manager.ResolveVote("host");

        var state = manager.Get(host.RoomCode)!.DrawAndGuessState!;
        Assert.Equal(host.PlayerId, state.DrawerPlayerId);
        Assert.Empty(state.CorrectGuesserIds);

        Assert.Equal("kedi", manager.RequestDrawAndGuessWord("host"));
        Assert.Throws<RoomException>(() => manager.RequestDrawAndGuessWord("guest"));
        Assert.Throws<RoomException>(() => manager.SubmitDrawAndGuessGuess("host", "kedi"));

        var wrong = manager.SubmitDrawAndGuessGuess("guest", "köpek");
        Assert.False(wrong.Correct);
        Assert.Equal("köpek", wrong.Text);
        Assert.Null(wrong.Rank);

        // Case/whitespace shouldn't matter, and a correct guess never carries the word back.
        var correct = manager.SubmitDrawAndGuessGuess("guest", "  Kedi ");
        Assert.True(correct.Correct);
        Assert.Equal(1, correct.Rank);
        Assert.Null(correct.Text);

        var afterGuess = manager.Get(host.RoomCode)!.DrawAndGuessState!;
        Assert.Equal(10, afterGuess.Scores[guest.PlayerId]);
        Assert.Contains(guest.PlayerId, afterGuess.CorrectGuesserIds);

        // Already correct this round — a repeat guess is a silent no-op, not a re-score.
        var again = manager.SubmitDrawAndGuessGuess("guest", "kedi");
        Assert.False(again.Correct);
        Assert.Equal(10, manager.Get(host.RoomCode)!.DrawAndGuessState!.Scores[guest.PlayerId]);
    }

    [Fact]
    public void NextDrawAndGuessRoundPaysTheDrawerAndRotatesAwayFromThem()
    {
        var manager = CreateManager(random: new FixedRoomRandom(0));
        var host = manager.Create(CreateRequest("Arda"));
        var guest = manager.Join(host.RoomCode, new JoinRoomRequest("Ali", "#123456"));
        manager.Attach(host.RoomCode, host.PlayerId, host.ReconnectToken, "host");
        manager.Attach(host.RoomCode, guest.PlayerId, guest.ReconnectToken, "guest");
        manager.BeginGameSelection("host", ["draw-and-guess"]);
        manager.CastVote("host", "draw-and-guess");
        manager.ResolveVote("host");
        manager.SubmitDrawAndGuessGuess("guest", "kedi");

        Assert.Throws<RoomException>(() => manager.NextDrawAndGuessRound("guest"));

        var next = manager.NextDrawAndGuessRound("host").DrawAndGuessState!;
        Assert.Equal(guest.PlayerId, next.DrawerPlayerId);
        Assert.Equal(2, next.RoundNumber);
        Assert.Empty(next.CorrectGuesserIds);
        // Host drew round 1 and never guesses their own word, so their only
        // points are the drawer bonus: one correct guesser * 2 points.
        Assert.Equal(2, next.Scores[host.PlayerId]);
        // Guest's round-1 guess score (10, for guessing first) carries forward untouched.
        Assert.Equal(10, next.Scores[guest.PlayerId]);
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
        var transferred = manager.Get(host.RoomCode)!;
        Assert.Equal(guest.PlayerId, transferred.HostPlayerId);
        Assert.Single(transferred.Players, player => player.IsHost);
        Assert.Empty(manager.SweepDisconnected());
        Assert.Equal("GAME_SELECTION", manager.ReturnToGameSelection("guest").Status);
    }

    private static RoomManager CreateManager(TimeProvider? timeProvider = null, IRoomRandom? random = null) => new(
        timeProvider ?? TimeProvider.System,
        Options.Create(new RoomOptions
        {
            DisconnectGraceSeconds = 25,
            QuestionLoadingMilliseconds = 1800,
        }),
        random ?? new FixedRoomRandom(0),
        HideSeekTestSupport.CreateManager());

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

    /// <summary>Hands out the given values in order, one per call, across either overload.</summary>
    private sealed class SequenceRoomRandom(params int[] values) : IRoomRandom
    {
        private int _index;
        public int Next(int maximumExclusive) => values[_index++] % maximumExclusive;
        public int Next(int minimumInclusive, int maximumExclusive) =>
            minimumInclusive + values[_index++] % (maximumExclusive - minimumInclusive);
    }
}
