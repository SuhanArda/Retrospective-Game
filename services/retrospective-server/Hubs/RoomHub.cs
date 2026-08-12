using Microsoft.AspNetCore.SignalR;
using Retrospective.Server.Contracts;
using Retrospective.Server.Rooms;

namespace Retrospective.Server.Hubs;

public sealed class RoomHub(RoomManager rooms, TimeProvider timeProvider, ILogger<RoomHub> logger) : Hub<IRoomClient>
{
    public static string GroupName(string roomCode) => $"room:{roomCode}";

    public async Task<HubJoinResult> RejoinRoom(string roomCode, string playerId, string reconnectToken)
    {
        try
        {
            var room = rooms.Attach(roomCode, playerId, reconnectToken, Context.ConnectionId);
            logger.LogInformation("Player {PlayerId} attached to room {RoomCode}", playerId, room.Code);
            await Groups.AddToGroupAsync(Context.ConnectionId, GroupName(room.Code));
            await Clients.Group(GroupName(room.Code)).RoomSnapshot(room);
            return new HubJoinResult(true, room);
        }
        catch (RoomException error)
        {
            logger.LogWarning("Room rejoin refused for room {RoomCode}, player {PlayerId}: {ErrorCode}", roomCode, playerId, error.Code);
            return new HubJoinResult(false, Error: error.Code);
        }
    }

    public Task<RoomSnapshot?> GetRoom(string roomCode) => Task.FromResult(rooms.Get(roomCode));

    public async Task<RoomSnapshot> BeginGameSelection(string[] candidateGameIds)
    {
        var room = rooms.BeginGameSelection(Context.ConnectionId, candidateGameIds);
        await Broadcast(room);
        return room;
    }

    public async Task<RoomSnapshot> CastVote(string gameId)
    {
        var room = rooms.CastVote(Context.ConnectionId, gameId);
        await Broadcast(room);
        return room;
    }

    public async Task<RoomSnapshot> ResolveVote()
    {
        var resolution = rooms.ResolveVote(Context.ConnectionId);
        await Broadcast(resolution.Snapshot);
        if (resolution.GameStarted)
            await Clients.Group(GroupName(resolution.Snapshot.Code)).GameStarted(resolution.Snapshot.CurrentGameSession!);
        return resolution.Snapshot;
    }

    public async Task<RoomSnapshot> ReturnToGameSelection()
    {
        var room = rooms.ReturnToGameSelection(Context.ConnectionId);
        await Broadcast(room);
        await Clients.Group(GroupName(room.Code)).ReturnedToGameSelection(room);
        return room;
    }

    public async Task<RoomSnapshot> ReturnToLobby()
    {
        var room = rooms.ReturnToLobby(Context.ConnectionId);
        await Broadcast(room);
        return room;
    }

    public async Task<SpinResult> RequestSpin()
    {
        var player = rooms.AuthenticateConnection(Context.ConnectionId);
        var result = rooms.Spin(Context.ConnectionId);
        await Clients.Group(GroupName(player.RoomCode)).SpinResult(result);
        var room = rooms.Get(player.RoomCode)!;
        await Broadcast(room);
        await Clients.Group(GroupName(player.RoomCode)).SpinBottleStateChanged(room.SpinBottleState!);
        return result;
    }

    public Task<RoomSnapshot> ChooseSpinCategory(string category, int expectedRevision) =>
        MutateSpinState(rooms.ChooseSpinCategory(Context.ConnectionId, category, expectedRevision));

    public Task<RoomSnapshot> ResetSpinCategory(int expectedRevision) =>
        MutateSpinState(rooms.ResetSpinCategory(Context.ConnectionId, expectedRevision));

    public Task<RoomSnapshot> ActivateSpinQuestion(int expectedRevision) =>
        MutateSpinState(rooms.ActivateSpinQuestion(Context.ConnectionId, expectedRevision));

    public Task<RoomSnapshot> PassSpinQuestion(string questionId, int expectedRevision) =>
        MutateSpinState(rooms.PassSpinQuestion(Context.ConnectionId, questionId, expectedRevision));

    public Task<RoomSnapshot> CompleteSpinQuestion(string questionId, int expectedRevision) =>
        MutateSpinState(rooms.CompleteSpinQuestion(Context.ConnectionId, questionId, expectedRevision));

    public async Task LeaveRoom()
    {
        var player = rooms.AuthenticateConnection(Context.ConnectionId);
        var room = rooms.Leave(Context.ConnectionId);
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, GroupName(player.RoomCode));
        if (room.Players.Count > 0) await Broadcast(room);
        else await Clients.Group(GroupName(player.RoomCode)).RoomClosed();
    }

    public async Task SendReaction(string emoji)
    {
        if (string.IsNullOrWhiteSpace(emoji) || emoji.Length > 16) return;
        var player = rooms.AuthenticateConnection(Context.ConnectionId);
        await Clients.Group(GroupName(player.RoomCode)).ReactionReceived(new RoomReaction(
            player.PlayerId, player.DisplayName, player.Color, emoji, timeProvider.GetUtcNow().ToUnixTimeMilliseconds()));
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (rooms.Disconnect(Context.ConnectionId) is { } room) await Broadcast(room);
        await base.OnDisconnectedAsync(exception);
    }

    private Task Broadcast(RoomSnapshot room) => Clients.Group(GroupName(room.Code)).RoomSnapshot(room);

    private async Task<RoomSnapshot> MutateSpinState(RoomSnapshot room)
    {
        await Broadcast(room);
        await Clients.Group(GroupName(room.Code)).SpinBottleStateChanged(room.SpinBottleState!);
        return room;
    }
}
