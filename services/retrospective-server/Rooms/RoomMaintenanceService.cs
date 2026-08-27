using Microsoft.AspNetCore.SignalR;
using Retrospective.Server.Hubs;

namespace Retrospective.Server.Rooms;

public sealed class RoomMaintenanceService(RoomManager rooms, IHubContext<RoomHub, IRoomClient> hub, AiQuestionGateway ai) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(100));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            foreach (var change in rooms.AdvanceTimedStates())
            {
                var clients = hub.Clients.Group(RoomHub.GroupName(change.RoomCode));
                await clients.RoomSnapshot(change.Snapshot);
                if (change.GameStarted) await clients.GameStarted(change.Snapshot.CurrentGameSession!);
                if (change.SpinStateChanged) await clients.SpinBottleStateChanged(change.Snapshot.SpinBottleState!);
                if (change.DrawAndGuessWordReveal is { } reveal) await clients.DrawAndGuessWordRevealed(reveal);
                if (change.RetroRushSnapshot is not null) await clients.RetroRushSnapshot(change.RetroRushSnapshot);
                if (change.DrawAndGuessStateChanged && change.Snapshot.DrawAndGuessState is { } drawAndGuessState)
                    await clients.DrawAndGuessStateChanged(drawAndGuessState);
            }
            foreach (var change in rooms.SweepDisconnected())
            {
                var clients = hub.Clients.Group(RoomHub.GroupName(change.RoomCode));
                if (change.Snapshot is null)
                {
                    await ai.DeleteSilently(change.RoomCode, change.RoomInstanceId, stoppingToken);
                    await clients.RoomClosed();
                }
                else
                {
                    await clients.RoomSnapshot(change.Snapshot);
                    if (rooms.GetRetroRushSnapshotForRoom(change.RoomCode) is { } retroRush)
                        await clients.RetroRushSnapshot(retroRush);
                }
            }
        }
    }
}
