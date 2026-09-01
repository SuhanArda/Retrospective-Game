using Microsoft.AspNetCore.SignalR;
using Retrospective.Server.Hubs;

namespace Retrospective.Server.Rooms.HideSeek;

/// <summary>
/// Saklambaç's dedicated 20Hz simulation loop — separate from the 10Hz
/// <see cref="RoomMaintenanceService"/> every other game shares, because
/// this one unicasts a different, vision-filtered payload to each
/// connection instead of broadcasting one shared snapshot to the room
/// group. Never sends a position through <c>Clients.Group</c>.
///
/// The only group broadcast this loop ever does is the small, non-secret
/// phase/state update — and only on the tick where it actually changed, via
/// <see cref="RoomManager.SetHideAndSeekState"/>, the same "push the cached
/// public field, then broadcast the fresh room snapshot" shape every other
/// game's own state-changed event already takes.
/// </summary>
public sealed class HideSeekGameLoopService(HideSeekManager hideSeek, RoomManager rooms, IHubContext<RoomHub, IRoomClient> hub) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(HideSeekConfig.TickInterval);
        var dtSeconds = HideSeekConfig.TickInterval.TotalSeconds;
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            foreach (var game in hideSeek.ActiveGames)
            {
                var tick = game.Tick(dtSeconds);
                var group = hub.Clients.Group(RoomHub.GroupName(tick.RoomCode));

                if (tick.UpdatedPublicState is { } updatedState && rooms.SetHideAndSeekState(tick.RoomCode, updatedState) is { } roomSnapshot)
                {
                    await group.RoomSnapshot(roomSnapshot);
                    await group.HideAndSeekStateChanged(updatedState);
                }

                foreach (var caughtEvent in tick.NewCatches)
                {
                    await group.PlayerCaught(caughtEvent);
                }

                foreach (var personal in tick.Players)
                {
                    if (personal.ConnectionId is null) continue; // disconnected right now — nobody to send to
                    await hub.Clients.Client(personal.ConnectionId).HideAndSeekSnapshot(personal.Snapshot);
                }
            }
        }
    }
}
