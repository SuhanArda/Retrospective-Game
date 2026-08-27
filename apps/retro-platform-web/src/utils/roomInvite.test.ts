import { describe, expect, it } from 'vitest';
import { buildRoomInviteUrl, roomJoinPath } from './roomInvite';

describe('room invite links', () => {
  it('targets the existing join route with a normalized room code', () => {
    expect(roomJoinPath(' abc123 ')).toBe('/room/join?roomCode=ABC123');
    expect(buildRoomInviteUrl('https://retro-platform.onrender.com', 'abc123')).toBe(
      'https://retro-platform.onrender.com/room/join?roomCode=ABC123',
    );
  });

  it('contains no player identity or reconnect credentials', () => {
    const invite = new URL(buildRoomInviteUrl('https://retro-platform.onrender.com', 'RYZ943'));

    expect([...invite.searchParams.entries()]).toEqual([['roomCode', 'RYZ943']]);
    expect(invite.toString()).not.toMatch(/playerId|hostPlayerId|reconnectToken|displayName|connection/i);
  });
});
