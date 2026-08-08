using Microsoft.Extensions.Time.Testing;
using RetroPlatform.Api.Domain;
using RetroPlatform.Api.Rooms;

namespace RetroPlatform.Api.Tests;

public class RoomStoreTests
{
    private static readonly string[] Candidates = ["retro-rush", "pixel-arena"];

    private static (RoomStore Store, FakeTimeProvider Time) NewStore()
    {
        var time = new FakeTimeProvider(DateTimeOffset.UnixEpoch.AddDays(1));
        return (new RoomStore(time), time);
    }

    private static CreateRoomRequest Request(string name = "Sprint 42") =>
        new(DisplayName: "Bahadır", Color: "#5b2a86", RoomName: name,
            MaxParticipants: 2, QuestionTimeSeconds: 30, VotingTimeSeconds: 30);

    [Fact]
    public void Creating_a_room_makes_the_creator_a_ready_host()
    {
        var (store, _) = NewStore();

        var (room, host) = store.Create(Request());

        Assert.Equal(RoomStatus.Lobby, room.Status);
        Assert.True(host.IsHost);
        Assert.True(host.IsReady);
        Assert.Equal(host.Id, room.HostPlayerId);
        Assert.Equal(6, room.Code.Length);
    }

    [Fact]
    public void Room_codes_do_not_repeat()
    {
        var (store, _) = NewStore();

        var codes = Enumerable.Range(0, 200).Select(_ => store.Create(Request()).Room.Code).ToList();

        Assert.Equal(codes.Count, codes.Distinct().Count());
    }

    [Fact]
    public void Joining_is_refused_once_the_room_is_full()
    {
        var (store, _) = NewStore();
        var (room, _) = store.Create(Request()); // MaxParticipants = 2

        var second = store.Join(room.Code, "Elif", "#ff8c42");
        var third = store.Join(room.Code, "Mert", "#2f9e6e");

        Assert.True(second.Result.Ok);
        Assert.Equal(RoomError.Full, third.Result.Error);
    }

    [Fact]
    public void Joining_is_case_insensitive_and_trims_the_code()
    {
        var (store, _) = NewStore();
        var (room, _) = store.Create(Request());

        var joined = store.Join($"  {room.Code.ToLowerInvariant()} ", "Elif", "#ff8c42");

        Assert.True(joined.Result.Ok);
    }

    [Fact]
    public void Unknown_and_malformed_codes_are_reported_differently()
    {
        var (store, _) = NewStore();

        Assert.Equal(RoomError.InvalidCode, store.Join("ABC", "Elif", "#fff").Result.Error);
        Assert.Equal(RoomError.NotFound, store.Join("ZZZZZZ", "Elif", "#fff").Result.Error);
    }

    [Fact]
    public void Only_the_host_can_open_the_vote()
    {
        var (store, _) = NewStore();
        var (room, host) = store.Create(Request());
        var (_, guest) = store.Join(room.Code, "Elif", "#ff8c42");

        Assert.Equal(RoomError.HostRequired, store.BeginGameSelection(room.Code, guest!.Id, Candidates).Error);
        Assert.True(store.BeginGameSelection(room.Code, host.Id, Candidates).Ok);
    }

    [Fact]
    public void The_vote_deadline_comes_from_the_rooms_own_setting()
    {
        var (store, time) = NewStore();
        var (room, host) = store.Create(Request());
        var start = time.GetUtcNow().ToUnixTimeMilliseconds();

        var open = store.BeginGameSelection(room.Code, host.Id, Candidates);

        Assert.Equal(start + 30_000, open.Room!.VotingEndsAt);
    }

    [Fact]
    public void Votes_replace_each_other_so_a_player_only_ever_has_one()
    {
        var (store, _) = NewStore();
        var (room, host) = store.Create(Request());
        store.BeginGameSelection(room.Code, host.Id, Candidates);

        store.CastVote(room.Code, host.Id, "retro-rush");
        var result = store.CastVote(room.Code, host.Id, "pixel-arena");

        Assert.Equal(new Dictionary<string, string> { [host.Id] = "pixel-arena" }, result.Room!.Votes);
    }

    [Fact]
    public void Votes_from_outside_the_room_are_refused()
    {
        var (store, _) = NewStore();
        var (room, host) = store.Create(Request());
        store.BeginGameSelection(room.Code, host.Id, Candidates);

        Assert.Equal(RoomError.NotInRoom, store.CastVote(room.Code, "stranger", "retro-rush").Error);
    }

    [Fact]
    public void Resolving_twice_keeps_the_first_result()
    {
        var (store, _) = NewStore();
        var (room, host) = store.Create(Request());
        store.BeginGameSelection(room.Code, host.Id, Candidates);
        store.CastVote(room.Code, host.Id, "retro-rush");

        var first = store.ResolveVote(room.Code, host.Id, Candidates).Room!;
        var second = store.ResolveVote(room.Code, host.Id, Candidates).Room!;

        Assert.Equal(RoomStatus.Playing, first.Status);
        Assert.Equal(first.SelectedGameId, second.SelectedGameId);
    }

    [Fact]
    public void The_server_may_resolve_a_vote_without_a_host()
    {
        var (store, _) = NewStore();
        var (room, host) = store.Create(Request());
        store.BeginGameSelection(room.Code, host.Id, Candidates);

        // playerId: null is the countdown expiring, not a person acting.
        var result = store.ResolveVote(room.Code, playerId: null, Candidates);

        Assert.True(result.Ok);
        Assert.Equal(RoomStatus.Playing, result.Room!.Status);
    }

    [Fact]
    public void Expired_votes_are_only_listed_after_the_deadline()
    {
        var (store, time) = NewStore();
        var (room, host) = store.Create(Request());
        store.BeginGameSelection(room.Code, host.Id, Candidates);

        Assert.Empty(store.ExpiredVotes());
        time.Advance(TimeSpan.FromSeconds(31));
        Assert.Single(store.ExpiredVotes());
    }

    [Fact]
    public void Leaving_hands_the_host_role_to_whoever_remains()
    {
        var (store, _) = NewStore();
        var (room, host) = store.Create(Request());
        var (_, guest) = store.Join(room.Code, "Elif", "#ff8c42");

        var result = store.Leave(room.Code, host.Id);

        Assert.Equal(guest!.Id, result.Room!.HostPlayerId);
        Assert.True(result.Room.Players.Single().IsHost);
    }

    [Fact]
    public void The_room_disappears_once_the_last_player_leaves()
    {
        var (store, _) = NewStore();
        var (room, host) = store.Create(Request());

        store.Leave(room.Code, host.Id);

        Assert.Null(store.Get(room.Code));
    }

    [Fact]
    public void A_dropped_connection_keeps_its_seat_until_the_grace_period_passes()
    {
        var (store, time) = NewStore();
        var (room, host) = store.Create(Request());
        store.Join(room.Code, "Elif", "#ff8c42");
        var guestId = store.Get(room.Code)!.Players[1].Id;

        store.MarkDisconnected(room.Code, guestId);

        // A reload reconnects well within the grace period.
        time.Advance(TimeSpan.FromSeconds(5));
        Assert.Empty(store.SweepDisconnected(30_000));
        Assert.Equal(2, store.Get(room.Code)!.Players.Count);

        time.Advance(TimeSpan.FromSeconds(30));
        var swept = store.SweepDisconnected(30_000);

        Assert.Single(swept);
        Assert.Equal([host.Id], store.Get(room.Code)!.Players.Select(p => p.Id));
    }

    [Fact]
    public void Reconnecting_clears_the_disconnected_mark()
    {
        var (store, time) = NewStore();
        var (room, _) = store.Create(Request());
        store.Join(room.Code, "Elif", "#ff8c42");
        var guestId = store.Get(room.Code)!.Players[1].Id;

        store.MarkDisconnected(room.Code, guestId);
        time.Advance(TimeSpan.FromSeconds(10));
        store.MarkReconnected(room.Code, guestId);
        time.Advance(TimeSpan.FromSeconds(40));

        Assert.Empty(store.SweepDisconnected(30_000));
        Assert.Equal(2, store.Get(room.Code)!.Players.Count);
    }

    [Fact]
    public void Sweeping_reports_a_closed_room_when_everyone_vanished()
    {
        var (store, time) = NewStore();
        var (room, host) = store.Create(Request());
        store.MarkDisconnected(room.Code, host.Id);
        time.Advance(TimeSpan.FromSeconds(31));

        var swept = store.SweepDisconnected(30_000);

        Assert.Single(swept);
        Assert.Null(swept[0].Room);
        Assert.Null(store.Get(room.Code));
    }

    [Fact]
    public void Returning_to_the_lobby_clears_the_previous_round()
    {
        var (store, _) = NewStore();
        var (room, host) = store.Create(Request());
        store.BeginGameSelection(room.Code, host.Id, Candidates);
        store.CastVote(room.Code, host.Id, "retro-rush");
        store.ResolveVote(room.Code, host.Id, Candidates);

        var back = store.ReturnToLobby(room.Code, host.Id).Room!;

        Assert.Equal(RoomStatus.Lobby, back.Status);
        Assert.Null(back.SelectedGameId);
        Assert.Null(back.TieBreak);
        Assert.Empty(back.Votes!);
    }
}
