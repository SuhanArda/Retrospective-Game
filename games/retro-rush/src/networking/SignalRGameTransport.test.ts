import { describe, expect, it, vi } from 'vitest';
import type { GameLaunchContext, RetroRushGameSnapshot, RoomSnapshot } from '@retro-platform/contracts';
import type { RoomRealtimeClient } from '@retro-platform/realtime-client';
import { SignalRGameTransport } from './SignalRGameTransport';

const launchContext: GameLaunchContext = {
  roomCode: 'ABC123',
  playerId: 'guest',
  displayName: 'Ali',
  gameId: 'retro-rush',
  isHost: false,
  gameSessionId: 'game-1',
  reconnectToken: 'secret',
};

const snapshot: RetroRushGameSnapshot = {
  gameSessionId: 'game-1',
  roundId: 1,
  mapSeed: 42,
  phase: 'COUNTDOWN',
  phaseStartedAtUtc: 10_000,
  roundStartAtUnixMs: 13_500,
  roundDeadlineAtUnixMs: 193_500,
  resultsEndAtUnixMs: 0,
  spawnX: 180,
  spawnY: 540,
  players: [{
    playerId: 'guest', displayName: 'Ali', color: '#123456', slot: 1, skinIndex: 1,
    connected: true, x: 180, y: 540, velocityX: 0, velocityY: 0, facing: 'right',
    movementState: 'ACTIVE', animationState: 'idle', sequence: 0, clientTimestamp: 0,
    roundId: 1, ability1AvailableAtUnixMs: 20_500, ability2AvailableAtUnixMs: 20_500, ability3AvailableAtUnixMs: 20_500,
  }],
  activeRockets: [],
  eliminationOrder: [],
  ranking: [],
};

const room: RoomSnapshot = {
  id: 'room-1', code: 'ABC123', roomName: 'Retro', hostPlayerId: 'host', players: [],
  selectedGameId: 'retro-rush', status: 'PLAYING', maxParticipants: 8,
  questionTimeSeconds: 30, votingTimeSeconds: 30, createdAt: 1,
  currentGameSession: {
    gameSessionId: 'game-1', gameId: 'retro-rush', roundId: '1', seed: 42,
    roundStartAtUnixMs: 13_500, state: 'ACTIVE',
  },
};

describe('SignalR Retro Rush authority replay', () => {
  it('replays an early countdown snapshot when Phaser subscribes after connect', async () => {
    const roomClient = {
      connect: vi.fn(async () => room),
      getRetroRushSnapshot: vi.fn(async () => snapshot),
      on: vi.fn(() => () => undefined),
    } as unknown as RoomRealtimeClient;
    const transport = new SignalRGameTransport(roomClient, launchContext);

    await transport.connect({ roomCode: 'ABC123', playerName: 'Ali' });
    const listener = vi.fn();
    transport.subscribe(listener);

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith({ type: 'retroSnapshot', snapshot });
  });
});
