import type { RoomSnapshot } from '@retro-platform/contracts';
import { describe, expect, it, vi } from 'vitest';
import { bindTankBattleRoomLifecycle, type TankBattleRoomEvents } from './roomLifecycle';

describe('Tank Battle room lifecycle', () => {
  it('tracks authoritative host transfers and returns every subscribed client', () => {
    const events = new FakeRoomEvents();
    const onHostChanged = vi.fn<(isHost: boolean) => void>();
    const onReturnedToGameSelection = vi.fn();
    const dispose = bindTankBattleRoomLifecycle(events, {
      localPlayerId: 'player-1',
      onHostChanged,
      onReturnedToGameSelection,
    });

    events.emitRoom({ hostPlayerId: 'player-1' } as RoomSnapshot);
    events.emitRoom({ hostPlayerId: 'player-2' } as RoomSnapshot);
    events.emitReturn();

    expect(onHostChanged.mock.calls).toEqual([[true], [false]]);
    expect(onReturnedToGameSelection).toHaveBeenCalledOnce();

    dispose();
    expect(events.hasListeners()).toBe(false);
  });
});

class FakeRoomEvents implements TankBattleRoomEvents {
  private roomListener: ((room: RoomSnapshot) => void) | null = null;
  private returnListener: (() => void) | null = null;

  onRoomSnapshot(listener: (room: RoomSnapshot) => void): () => void {
    this.roomListener = listener;
    return () => { this.roomListener = null; };
  }

  onReturnedToGameSelection(listener: () => void): () => void {
    this.returnListener = listener;
    return () => { this.returnListener = null; };
  }

  emitRoom(room: RoomSnapshot): void { this.roomListener?.(room); }
  emitReturn(): void { this.returnListener?.(); }
  hasListeners(): boolean { return Boolean(this.roomListener || this.returnListener); }
}
