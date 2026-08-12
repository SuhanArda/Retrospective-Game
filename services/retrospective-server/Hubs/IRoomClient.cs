using Retrospective.Server.Contracts;

namespace Retrospective.Server.Hubs;

public interface IRoomClient
{
    Task RoomSnapshot(RoomSnapshot room);
    Task RoomClosed();
    Task GameStarted(GameSessionSnapshot session);
    Task ReturnedToGameSelection(RoomSnapshot room);
    Task SpinResult(SpinResult result);
    Task SpinBottleStateChanged(SpinBottleStateSnapshot state);
    Task ReactionReceived(RoomReaction reaction);
}
