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

  describe('game voting', () => {
    const CANDIDATES = ['retro-rush', 'pixel-arena'];

    async function roomWithHostAndGuest(random = () => 0) {
      const rooms = new MemoryStorage();
      const host = new MockRoomService(
        rooms, new MemoryStorage(), () => 'host-id', () => 'ABC123', () => null, () => 1_000, random,
      );
      await host.createRoom(request('Host'));
      const guest = new MockRoomService(
        rooms, new MemoryStorage(), () => 'guest-id', () => 'ZZZ999', () => null, () => 1_000, random,
      );
      await guest.joinRoom({ roomCode: 'ABC123', displayName: 'Guest', color: '#ff8c42' });
      return { host, guest };
    }

    it('opens the vote with a deadline and no leftover result', async () => {
      const { host } = await roomWithHostAndGuest();
      const room = await host.beginGameSelection(CANDIDATES);

      expect(room.status).toBe('GAME_SELECTION');
      expect(room.votes).toEqual({});
      expect(room.votingEndsAt).toBe(1_000 + 30 * 1000);
      expect(room.selectedGameId).toBeUndefined();
    });

    it('records one vote per player and lets a player change their mind', async () => {
      const { host, guest } = await roomWithHostAndGuest();
      await host.beginGameSelection(CANDIDATES);

      await host.castVote('retro-rush');
      await guest.castVote('pixel-arena');
      const room = await guest.castVote('retro-rush');

      expect(room.votes).toEqual({ 'host-id': 'retro-rush', 'guest-id': 'retro-rush' });
    });

    it('resolves to the most-voted game without flagging a tie-break', async () => {
      const { host, guest } = await roomWithHostAndGuest();
      await host.beginGameSelection(CANDIDATES);
      await host.castVote('pixel-arena');
      await guest.castVote('pixel-arena');

      const room = await host.resolveVote(CANDIDATES);
      expect(room.status).toBe('PLAYING');
      expect(room.selectedGameId).toBe('pixel-arena');
      expect(room.tieBreak).toBeUndefined();
      expect(room.votingEndsAt).toBeUndefined();
    });

    it('reopens game selection from a playing room without replacing the host session', async () => {
      const { host } = await roomWithHostAndGuest();
      await host.beginGameSelection(CANDIDATES);
      await host.castVote('retro-rush');
      await host.resolveVote(CANDIDATES);
      const playerBeforeReturn = host.getCurrentPlayer();

      const room = await host.beginGameSelection(CANDIDATES);

      expect(room.status).toBe('GAME_SELECTION');
      expect(room.selectedGameId).toBeUndefined();
      expect(host.getCurrentPlayer()).toEqual(playerBeforeReturn);
    });

    it('records the candidates when a draw is settled at random', async () => {
      const { host, guest } = await roomWithHostAndGuest(() => 0);
      await host.beginGameSelection(CANDIDATES);
      await host.castVote('retro-rush');
      await guest.castVote('pixel-arena');

      const room = await host.resolveVote(CANDIDATES);
      expect(room.tieBreak).toEqual({ candidates: CANDIDATES, winner: 'retro-rush' });
      expect(room.selectedGameId).toBe('retro-rush');
    });

    it('refuses to let a guest close the vote', async () => {
      const { host, guest } = await roomWithHostAndGuest();
      await host.beginGameSelection(CANDIDATES);
      await expect(guest.resolveVote(CANDIDATES)).rejects.toThrow('HOST_REQUIRED');
    });

    it('keeps the first result when the vote is resolved twice', async () => {
      const { host, guest } = await roomWithHostAndGuest();
      await host.beginGameSelection(CANDIDATES);
      await guest.castVote('pixel-arena');

      const first = await host.resolveVote(CANDIDATES);
      const second = await host.resolveVote(CANDIDATES);
      expect(second.selectedGameId).toBe(first.selectedGameId);
    });

    it('ignores votes cast once the vote is already closed', async () => {
      const { host, guest } = await roomWithHostAndGuest();
      await host.beginGameSelection(CANDIDATES);
      await host.castVote('retro-rush');
      await host.resolveVote(CANDIDATES);

      const room = await guest.castVote('pixel-arena');
      expect(room.votes).toEqual({ 'host-id': 'retro-rush' });
    });
  });

  describe('reactions', () => {
    async function roomWithListener() {
      const service = new MockRoomService(
        new MemoryStorage(),
        new MemoryStorage(),
        () => 'player-1',
        () => 'ABC123',
        () => null,
        () => 1_700_000_000_000,
      );
      const { room } = await service.createRoom(request('Arda'));
      const seen: unknown[] = [];
      const stop = service.subscribeToReactions(room.code, (reaction) => seen.push(reaction));
      return { service, room, seen, stop };
    }

    it('stamps a reaction with the sender taken from the room, not the caller', async () => {
      const { service, seen } = await roomWithListener();

      await service.sendReaction('🔥');

      expect(seen).toEqual([
        {
          playerId: 'player-1',
          displayName: 'Arda',
          color: '#5b2a86',
          emoji: '🔥',
          sentAt: 1_700_000_000_000,
        },
      ]);
    });

    it('delivers to the sender too, the way the server broadcast does', async () => {
      const { service, seen } = await roomWithListener();

      await service.sendReaction('👍');
      await service.sendReaction('💀');

      expect(seen).toHaveLength(2);
    });

    it('stops delivering once unsubscribed', async () => {
      const { service, seen, stop } = await roomWithListener();

      stop();
      await service.sendReaction('🎉');

      expect(seen).toEqual([]);
    });

    it('does nothing when there is no room to react in', async () => {
      const service = new MockRoomService(
        new MemoryStorage(),
        new MemoryStorage(),
        () => 'player-1',
        () => 'ABC123',
        () => null,
      );

      await expect(service.sendReaction('🔥')).resolves.toBeUndefined();
    });
  });
});
