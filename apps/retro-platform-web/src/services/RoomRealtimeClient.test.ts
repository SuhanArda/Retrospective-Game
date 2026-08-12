import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStorage } from '../testing/MemoryStorage';

const signalR = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  let reconnectHandler: (() => void) | undefined;
  const connection = {
    state: 'Disconnected',
    on: vi.fn((name: string, handler: (...args: unknown[]) => void) => handlers.set(name, handler)),
    onreconnecting: vi.fn(),
    onreconnected: vi.fn((handler: () => void) => { reconnectHandler = handler; }),
    onclose: vi.fn(),
    start: vi.fn(async () => { connection.state = 'Connected'; }),
    stop: vi.fn(async () => { connection.state = 'Disconnected'; }),
    invoke: vi.fn<(...args: unknown[]) => Promise<unknown>>(async (...args: unknown[]) => {
      void args;
      return { ok: true, room: { code: 'ABC123' } };
    }),
  };
  const builder = {
    withUrl: vi.fn(() => builder),
    withAutomaticReconnect: vi.fn(() => builder),
    configureLogging: vi.fn(() => builder),
    build: vi.fn(() => connection),
  };
  return { handlers, connection, builder, reconnect: () => reconnectHandler?.() };
});

vi.mock('@microsoft/signalr', () => ({
  HubConnectionBuilder: class { constructor() { return signalR.builder; } },
  HubConnectionState: { Connected: 'Connected' },
  LogLevel: { Warning: 3 },
}));

import { RoomRealtimeClient } from '@retro-platform/realtime-client';
import { SignalRRoomService } from './SignalRRoomService';

describe('RoomRealtimeClient reconnect handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signalR.connection.state = 'Disconnected';
    signalR.connection.invoke.mockImplementation(async () => ({ ok: true, room: { code: 'ABC123' } }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('reattaches with stable player credentials after SignalR reconnects', async () => {
    const client = new RoomRealtimeClient('http://localhost:5281', {
      roomCode: 'ABC123', playerId: 'player-1', reconnectToken: 'secret-token',
    });
    await client.connect();

    signalR.reconnect();
    await vi.waitFor(() => expect(signalR.connection.invoke).toHaveBeenCalledTimes(2));
    expect(signalR.connection.invoke).toHaveBeenLastCalledWith(
      'RejoinRoom', 'ABC123', 'player-1', 'secret-token',
    );
    expect(signalR.builder.withAutomaticReconnect).toHaveBeenCalled();
  });

  it('uses the explicit authoritative voting commands', async () => {
    const client = new RoomRealtimeClient('http://localhost:5281', {
      roomCode: 'ABC123', playerId: 'player-1', reconnectToken: 'secret-token',
    });
    await client.connect();
    signalR.connection.invoke.mockClear();

    await client.beginGameSelection(['retro-rush', 'spin-the-bottle']);
    await client.castVote('spin-the-bottle');
    await client.resolveVote();

    expect(signalR.connection.invoke.mock.calls).toEqual([
      ['BeginGameSelection', ['retro-rush', 'spin-the-bottle']],
      ['CastVote', 'spin-the-bottle'],
      ['ResolveVote'],
    ]);
  });

  it('sends the host-selected duration and preserves voting deadlines from real snapshots', async () => {
    const room = {
      id: 'room-1', code: 'ABC123', roomName: 'Sprint Retro', hostPlayerId: 'player-1',
      players: [{ id: 'player-1', displayName: 'Arda', color: '#654321', isHost: true, isReady: true, isConnected: true, joinedAt: 1 }],
      status: 'LOBBY', maxParticipants: 10, questionTimeSeconds: 30, votingTimeSeconds: 45, createdAt: 1,
      votes: {}, candidateGameIds: [],
    };
    signalR.connection.invoke.mockImplementation(async (...args: unknown[]) =>
      args[0] === 'RejoinRoom' ? { ok: true, room } : room,
    );
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('http://localhost:5281/api/rooms');
      expect(init?.method).toBe('POST');
      return {
        ok: true,
        json: async () => ({
          roomCode: 'ABC123', playerId: 'player-1', displayName: 'Arda', isHost: true,
          reconnectToken: 'secret-token', room, player: room.players[0],
        }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);
    const service = new SignalRRoomService('http://localhost:5281', new MemoryStorage());

    await service.createRoom({
      displayName: 'Arda', color: '#654321', roomName: 'Sprint Retro', maxParticipants: 10,
      questionTimeSeconds: 30, votingTimeSeconds: 45,
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ votingTimeSeconds: 45 });

    const liveSnapshot = {
      ...room,
      status: 'GAME_SELECTION',
      votingStartedAt: 10_000,
      votingEndsAt: 55_000,
      candidateGameIds: ['retro-rush', 'spin-the-bottle'],
    };
    signalR.handlers.get('RoomSnapshot')?.(liveSnapshot);
    expect(service.getRoom('ABC123')).toMatchObject({
      votingTimeSeconds: 45,
      votingStartedAt: 10_000,
      votingEndsAt: 55_000,
    });
  });
});
