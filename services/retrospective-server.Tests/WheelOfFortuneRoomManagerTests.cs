using Microsoft.Extensions.Options;
using Retrospective.Server.Contracts;
using Retrospective.Server.Rooms;

namespace Retrospective.Server.Tests;

public sealed class WheelOfFortuneRoomManagerTests
{
    [Fact]
    public void HostQuestionsAreAuthoritativeEditableAndGuestMutationsAreRejected()
    {
        var (manager, host, guest, _) = StartRoom();
        var added = manager.AddWheelQuestion("host", new(host.Room.CurrentGameSession!.GameSessionId, "  Ne iyi gitti?  "));
        Assert.Equal("Ne iyi gitti?", Assert.Single(added.Snapshot.Questions).Text);
        Assert.Throws<RoomException>(() => manager.AddWheelQuestion("guest", new(host.Room.CurrentGameSession!.GameSessionId, "Hayır")));

        var question = added.Snapshot.Questions.Single();
        var edited = manager.UpdateWheelQuestion("host", new(host.Room.CurrentGameSession!.GameSessionId, question.Id, "Ne öğrendik?"));
        Assert.Equal("Ne öğrendik?", edited.Snapshot.Questions.Single().Text);
        Assert.Throws<RoomException>(() => manager.RemoveWheelQuestion("guest", host.Room.CurrentGameSession!.GameSessionId, question.Id));
        Assert.Empty(manager.RemoveWheelQuestion("host", host.Room.CurrentGameSession!.GameSessionId, question.Id).Snapshot.Questions);
        Assert.Throws<RoomException>(() => manager.AddWheelQuestion("host", new(host.Room.CurrentGameSession!.GameSessionId, "   ")));
        Assert.Equal(guest.PlayerId, manager.Get(host.RoomCode)!.Players.Single(player => player.Id == guest.PlayerId).Id);
    }

    [Fact]
    public void SpinsAreHostOnlyOrderedAuthoritativeAndDuplicateSafe()
    {
        var clock = new MutableTimeProvider(DateTimeOffset.Parse("2026-09-04T10:00:00Z"));
        var (manager, host, guest, _) = StartRoom(clock);
        var sessionId = manager.Get(host.RoomCode)!.CurrentGameSession!.GameSessionId;
        manager.AddWheelQuestion("host", new(sessionId, "Ne iyi gitti?"));
        manager.StartWheelGame("host", new(sessionId));

        Assert.Throws<RoomException>(() => manager.SpinWheelQuestion("host", new(sessionId)));
        Assert.Throws<RoomException>(() => manager.SpinWheelPlayer("guest", new(sessionId)));

        var playerSpin = manager.SpinWheelPlayer("host", new(sessionId)).Snapshot;
        Assert.Equal(host.PlayerId, playerSpin.SelectedPlayerId);
        Assert.Equal("PLAYER_WHEEL_SPINNING", playerSpin.Phase);
        Assert.Throws<RoomException>(() => manager.SpinWheelPlayer("host", new(sessionId)));

        var rejoined = manager.Attach(host.RoomCode, guest.PlayerId, guest.ReconnectToken, "guest-new");
        Assert.Equal(playerSpin.PlayerSpin!.SpinId, rejoined.WheelOfFortuneState!.PlayerSpin!.SpinId);

        clock.Advance(TimeSpan.FromSeconds(4));
        var transition = Assert.Single(manager.AdvanceTimedStates());
        Assert.True(transition.WheelOfFortuneStateChanged);
        Assert.Equal("QUESTION_WHEEL_READY", transition.Snapshot.WheelOfFortuneState!.Phase);

        var questionSpin = manager.SpinWheelQuestion("host", new(sessionId)).Snapshot;
        Assert.Equal(questionSpin.Questions.Single().Id, questionSpin.SelectedQuestionId);
        Assert.Throws<RoomException>(() => manager.SpinWheelQuestion("host", new(sessionId)));
        clock.Advance(TimeSpan.FromSeconds(4));
        manager.AdvanceTimedStates();
        Assert.Equal("QUESTION_REVEAL", manager.Get(host.RoomCode)!.WheelOfFortuneState!.Phase);
    }

    [Fact]
    public void QuestionsDoNotRepeatUntilThePoolIsExhaustedAndNextRoundKeepsSetup()
    {
        var clock = new MutableTimeProvider(DateTimeOffset.Parse("2026-09-04T10:00:00Z"));
        var (manager, host, _, _) = StartRoom(clock);
        var sessionId = manager.Get(host.RoomCode)!.CurrentGameSession!.GameSessionId;
        var first = manager.AddWheelQuestion("host", new(sessionId, "Birinci?")).Snapshot.Questions.Single();
        var second = manager.AddWheelQuestion("host", new(sessionId, "İkinci?")).Snapshot.Questions.Last();
        manager.StartWheelGame("host", new(sessionId));

        Assert.Equal(first.Id, PlayRound(manager, clock, sessionId, "host").SelectedQuestionId);
        var next = manager.NextWheelRound("host", new(sessionId)).Snapshot;
        Assert.Equal(2, next.RoundNumber);
        Assert.Equal(2, next.Questions.Count);
        Assert.Null(next.SelectedPlayerId);
        Assert.Null(next.SelectedQuestionId);

        Assert.Equal(second.Id, PlayRound(manager, clock, sessionId, "host").SelectedQuestionId);
        manager.NextWheelRound("host", new(sessionId));
        var recycled = PlayRound(manager, clock, sessionId, "host");
        Assert.Equal(first.Id, recycled.SelectedQuestionId);
        Assert.Single(recycled.UsedQuestionIds);
    }

    [Fact]
    public void StaleSessionIsRejectedAndTransferredHostCanControlTheGame()
    {
        var clock = new MutableTimeProvider(DateTimeOffset.Parse("2026-09-04T10:00:00Z"));
        var (manager, host, guest, _) = StartRoom(clock);
        var sessionId = manager.Get(host.RoomCode)!.CurrentGameSession!.GameSessionId;
        Assert.Throws<RoomException>(() => manager.AddWheelQuestion("host", new("stale", "Soru")));

        manager.Disconnect("host");
        clock.Advance(TimeSpan.FromSeconds(26));
        manager.SweepDisconnected();
        var state = manager.AddWheelQuestion("guest", new(sessionId, "Yeni host sorusu")).Snapshot;
        Assert.Equal(guest.PlayerId, manager.Get(host.RoomCode)!.HostPlayerId);
        Assert.Single(state.Questions);
    }

    private static WheelOfFortuneStateSnapshot PlayRound(
        RoomManager manager, MutableTimeProvider clock, string sessionId, string hostConnection)
    {
        manager.SpinWheelPlayer(hostConnection, new(sessionId));
        clock.Advance(TimeSpan.FromSeconds(4));
        manager.AdvanceTimedStates();
        var state = manager.SpinWheelQuestion(hostConnection, new(sessionId)).Snapshot;
        clock.Advance(TimeSpan.FromSeconds(4));
        manager.AdvanceTimedStates();
        return state;
    }

    private static (RoomManager Manager, RoomAdmission Host, RoomAdmission Guest, MutableTimeProvider Clock) StartRoom(
        MutableTimeProvider? clock = null)
    {
        clock ??= new MutableTimeProvider(DateTimeOffset.Parse("2026-09-04T10:00:00Z"));
        var manager = new RoomManager(clock, Options.Create(new RoomOptions
        {
            DisconnectGraceSeconds = 25,
            QuestionLoadingMilliseconds = 1_800,
        }), new FixedRoomRandom(), HideSeekTestSupport.CreateManager());
        var host = manager.Create(new CreateRoomRequest("Host", "#654321", "Retro", 10, 30, 30));
        var guest = manager.Join(host.RoomCode, new JoinRoomRequest("Guest", "#123456"));
        manager.Attach(host.RoomCode, host.PlayerId, host.ReconnectToken, "host");
        manager.Attach(host.RoomCode, guest.PlayerId, guest.ReconnectToken, "guest");
        manager.BeginGameSelection("host", ["wheel-of-fortune"]);
        manager.CastVote("host", "wheel-of-fortune");
        manager.ResolveVote("host");
        var currentHost = host with { Room = manager.Get(host.RoomCode)! };
        return (manager, currentHost, guest, clock);
    }

    private sealed class FixedRoomRandom : IRoomRandom
    {
        public int Next(int maximumExclusive) => 0;
        public int Next(int minimumInclusive, int maximumExclusive) => minimumInclusive;
    }

    private sealed class MutableTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
        public void Advance(TimeSpan amount) => now += amount;
    }
}
