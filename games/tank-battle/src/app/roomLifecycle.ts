import type { RoomSnapshot } from '@retro-platform/contracts';

export interface TankBattleRoomEvents {
  onRoomSnapshot(listener: (room: RoomSnapshot) => void): () => void;
  onReturnedToGameSelection(listener: () => void): () => void;
}

interface RoomLifecycleHandlers {
  localPlayerId: string;
  onHostChanged: (isHost: boolean) => void;
  onReturnedToGameSelection: () => void;
}

export function bindTankBattleRoomLifecycle(
  events: TankBattleRoomEvents,
  handlers: RoomLifecycleHandlers,
): () => void {
  const disposeRoom = events.onRoomSnapshot((room) => {
    handlers.onHostChanged(room.hostPlayerId === handlers.localPlayerId);
  });
  const disposeReturn = events.onReturnedToGameSelection(handlers.onReturnedToGameSelection);

  return () => {
    disposeRoom();
    disposeReturn();
  };
}
