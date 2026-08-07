import { describe, expect, it } from 'vitest';
import { MemoryStorage } from '../testing/MemoryStorage';
import { MockRoomService } from './MockRoomService';

function request(displayName: string) {
  return {
    displayName,
    color: '#5b2a86',
    roomName: 'Sprint 42',
    maxParticipants: 10,
    questionTimeSeconds: 30,
    votingTimeSeconds: 30,
  };
}

describe('MockRoomService', () => {
  it('creates a room with a ready host and saves the current session', async () => {
    const rooms = new MemoryStorage();
    const session = new MemoryStorage();
    const ids = ['player-1', 'room-1'];
    const service = new MockRoomService(rooms, session, () => ids.shift() ?? 'fallback', () => 'ABC123', () => null);
    const result = await service.createRoom(request('Arda'));

    expect(result.room.code).toBe('ABC123');
    expect(result.room.status).toBe('LOBBY');
    expect(result.player).toMatchObject({ displayName: 'Arda', isHost: true, isReady: true });
    expect(service.getCurrentRoom()).toEqual(result.room);
  });

  it('joins an existing mock room from another same-browser session', async () => {
    const rooms = new MemoryStorage();
    const host = new MockRoomService(rooms, new MemoryStorage(), () => 'host-id', () => 'ABC123', () => null);
    await host.createRoom(request('Host'));
    const guest = new MockRoomService(rooms, new MemoryStorage(), () => 'guest-id', () => 'ZZZ999', () => null);

    const result = await guest.joinRoom({ roomCode: ' abc123 ', displayName: 'Guest', color: '#ff8c42' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.room.players.map((player) => player.displayName)).toEqual(['Host', 'Guest']);
  });

  it('returns backend-compatible errors for missing rooms', async () => {
    const service = new MockRoomService(new MemoryStorage(), new MemoryStorage(), () => 'guest-id', () => 'ABC123', () => null);
    await expect(service.joinRoom({ roomCode: 'ABC123', displayName: 'Guest', color: '#fff' })).resolves.toEqual({ ok: false, error: 'ROOM_NOT_FOUND' });
  });
});
