import { describe, expect, it, vi } from 'vitest';
import { RoomRealtimeClient } from '@retro-platform/realtime-client';
import type { DrawAndGuessGuessResult } from '@retro-platform/contracts';
import { DrawAndGuessRoomBridge } from './roomBridge';

type TestEmitter = {
  emit(event: 'drawAndGuessGuessSubmitted', value: DrawAndGuessGuessResult): void;
};

describe('DrawAndGuessRoomBridge', () => {
  it('forwards each guess broadcast once and removes the handler when disposed', () => {
    const client = new RoomRealtimeClient('http://localhost', {
      roomCode: 'ABC123',
      playerId: 'player-1',
      reconnectToken: 'token',
    });
    const emit = (client as unknown as TestEmitter).emit.bind(client);
    const bridge = new DrawAndGuessRoomBridge(client, 'game-session-1');
    const listener = vi.fn();
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    bridge.onGuess(listener);

    const result: DrawAndGuessGuessResult = {
      playerId: 'player-2',
      displayName: 'Ali',
      correct: false,
      text: 'deneme',
    };
    emit('drawAndGuessGuessSubmitted', result);
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(result);

    const correctResult: DrawAndGuessGuessResult = {
      playerId: 'player-2',
      displayName: 'Ali',
      correct: true,
      rank: 1,
    };
    emit('drawAndGuessGuessSubmitted', correctResult);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenLastCalledWith(correctResult);

    bridge.dispose();
    emit('drawAndGuessGuessSubmitted', result);
    expect(listener).toHaveBeenCalledTimes(2);
    log.mockRestore();
  });
});
