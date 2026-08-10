using Microsoft.AspNetCore.SignalR;
using RetroPlatform.Api.Domain;
using RetroPlatform.Api.Rooms;

namespace RetroPlatform.Api.Hubs;

public sealed record JoinRoomResponse(bool Ok, RetroRoom? Room, RoomPlayer? Player, string? Error);

public sealed record CreateRoomResponse(RetroRoom Room, RoomPlayer Player);

/// <summary>
/// The live connection between a browser and its room. Every method that
/// changes a room re-broadcasts the whole snapshot to the room's group, so
/// clients never have to merge partial updates — they just replace their copy.
///
/// Nothing here trusts the caller for identity: the room code and player id
/// come from connection state established at join time, never from arguments.
/// </summary>
public sealed class RoomHub(RoomStore store, ILogger<RoomHub> logger) : Hub
{
    private const string RoomSnapshot = "RoomSnapshot";
    private const string RoomClosed = "RoomClosed";

    private string? RoomCode
    {
        get => Context.Items.TryGetValue(nameof(RoomCode), out var value) ? value as string : null;
        set => Context.Items[nameof(RoomCode)] = value;
    }

    private string? PlayerId
    {
        get => Context.Items.TryGetValue(nameof(PlayerId), out var value) ? value as string : null;
        set => Context.Items[nameof(PlayerId)] = value;
    }

    public async Task<CreateRoomResponse> CreateRoom(CreateRoomRequest request)
    {
        var (room, player) = store.Create(request);
        await TrackAsync(room.Code, player.Id);
        logger.LogInformation("Room {Code} created by {Player}", room.Code, player.Id);
        return new CreateRoomResponse(room, player);
    }

    public async Task<JoinRoomResponse> JoinRoom(string roomCode, string displayName, string color)
    {
        var (result, player) = store.Join(roomCode, displayName, color);
        if (!result.Ok || player is null)
        {
            return new JoinRoomResponse(false, null, null, ErrorCode(result.Error));
        }

        await TrackAsync(result.Room!.Code, player.Id);
        await BroadcastAsync(result.Room);
        return new JoinRoomResponse(true, result.Room, player, null);
    }

    /// <summary>
    /// Re-attaches a player who was already in the room — used after a page
    /// reload, which drops the socket but not the player's place in the room.
    /// </summary>
    public async Task<JoinRoomResponse> RejoinRoom(string roomCode, string playerId)
    {
        var result = store.MarkReconnected(roomCode, playerId);
        if (!result.Ok) return new JoinRoomResponse(false, null, null, ErrorCode(result.Error));

        await TrackAsync(result.Room!.Code, playerId);
        await BroadcastAsync(result.Room);
        var player = result.Room.Players.First(p => p.Id == playerId);
        return new JoinRoomResponse(true, result.Room, player, null);
    }

    public RetroRoom? GetRoom(string roomCode) => store.Get(roomCode);

    public async Task LeaveRoom()
    {
        if (RoomCode is null || PlayerId is null) return;
        var code = RoomCode;
        var result = store.Leave(code, PlayerId);
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, code);
        RoomCode = null;
        PlayerId = null;
        await PublishAsync(code, result.Room);
    }

    public Task<RetroRoom?> BeginGameSelection(string[] candidateGameIds) =>
        MutateAsync((code, playerId) => store.BeginGameSelection(code, playerId, candidateGameIds));

    public Task<RetroRoom?> CastVote(string gameId) =>
        MutateAsync((code, playerId) => store.CastVote(code, playerId, gameId));

    public Task<RetroRoom?> ResolveVote(string[] candidateIds) =>
        MutateAsync((code, playerId) => store.ResolveVote(code, playerId, candidateIds));

    public Task<RetroRoom?> ReturnToLobby() => MutateAsync(store.ReturnToLobby);

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (RoomCode is not null && PlayerId is not null)
        {
            // Keep them in the room for now; the sweeper removes them if they
            // do not come back. A refresh looks identical to a disconnect here.
            var result = store.MarkDisconnected(RoomCode, PlayerId);
            if (result.Room is not null) await BroadcastAsync(result.Room);
        }
        await base.OnDisconnectedAsync(exception);
    }

    private async Task<RetroRoom?> MutateAsync(Func<string, string, RoomResult> mutate)
    {
        if (RoomCode is null || PlayerId is null) throw new HubException(nameof(RoomError.NotInRoom));
        var result = mutate(RoomCode, PlayerId);
        if (!result.Ok) throw new HubException(ErrorCode(result.Error));
        await BroadcastAsync(result.Room!);
        return result.Room;
    }

    private async Task TrackAsync(string roomCode, string playerId)
    {
        RoomCode = roomCode;
        PlayerId = playerId;
        await Groups.AddToGroupAsync(Context.ConnectionId, roomCode);
    }

    private Task BroadcastAsync(RetroRoom room) =>
        Clients.Group(room.Code).SendAsync(RoomSnapshot, room);

    private Task PublishAsync(string roomCode, RetroRoom? room) =>
        room is null
            ? Clients.Group(roomCode).SendAsync(RoomClosed)
            : Clients.Group(roomCode).SendAsync(RoomSnapshot, room);

    private static string ErrorCode(RoomError error) => error switch
    {
        RoomError.NotFound => "ROOM_NOT_FOUND",
        RoomError.Full => "ROOM_FULL",
        RoomError.AlreadyStarted => "ROOM_ALREADY_STARTED",
        RoomError.InvalidCode => "INVALID_ROOM_CODE",
        RoomError.HostRequired => "HOST_REQUIRED",
        RoomError.NotInRoom => "NOT_IN_ROOM",
        _ => "UNKNOWN",
    };
}
