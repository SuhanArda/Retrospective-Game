using Microsoft.AspNetCore.SignalR;
using RetroPlatform.Api.Hubs;

namespace RetroPlatform.Api.Rooms;

/// <summary>
/// Does the two jobs no single client can be trusted with: closing a vote when
/// its countdown runs out, and dropping players who never reconnected.
///
/// Putting the countdown here rather than in the host's browser means the
/// result is the same for everyone even if the host closes their laptop.
/// </summary>
public sealed class RoomMaintenanceService(
    RoomStore store,
    IHubContext<RoomHub> hub,
    ILogger<RoomMaintenanceService> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromMilliseconds(500);

    /// <summary>How long a dropped connection keeps its seat. A reload takes well under this.</summary>
    private const long DisconnectGraceMs = 30_000;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(Interval);
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                await CloseExpiredVotesAsync(stoppingToken);
                await RemoveLostPlayersAsync(stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                // One bad room must not kill the loop for every other room.
                logger.LogError(ex, "Room maintenance pass failed");
            }
        }
    }

    private async Task CloseExpiredVotesAsync(CancellationToken cancellationToken)
    {
        foreach (var room in store.ExpiredVotes())
        {
            var candidates = room.CandidateGameIds ?? [];
            if (candidates.Count == 0) continue;

            var result = store.ResolveVote(room.Code, playerId: null, candidates);
            if (result.Room is null) continue;

            logger.LogInformation(
                "Vote closed for room {Code}; winner {Game}", room.Code, result.Room.SelectedGameId);
            await hub.Clients.Group(room.Code)
                .SendAsync("RoomSnapshot", result.Room, cancellationToken);
        }
    }

    private async Task RemoveLostPlayersAsync(CancellationToken cancellationToken)
    {
        foreach (var (code, room) in store.SweepDisconnected(DisconnectGraceMs))
        {
            if (room is null)
            {
                logger.LogInformation("Room {Code} closed; everyone disconnected", code);
                await hub.Clients.Group(code).SendAsync("RoomClosed", cancellationToken);
            }
            else
            {
                await hub.Clients.Group(code).SendAsync("RoomSnapshot", room, cancellationToken);
            }
        }
    }
}
