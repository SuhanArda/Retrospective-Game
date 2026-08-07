import { describe, expect, it } from 'vitest';
import { validateJoinRoom } from './joinRoomValidation';

describe('join-room validation', () => {
  it('reports empty room codes and display names independently', () => {
    expect(validateJoinRoom({ roomCode: ' ', displayName: '' })).toEqual({
      roomCode: 'EMPTY_ROOM_CODE',
      displayName: 'EMPTY_DISPLAY_NAME',
    });
  });

  it('reports malformed codes', () => {
    expect(validateJoinRoom({ roomCode: 'ABC', displayName: 'Arda' })).toEqual({
      roomCode: 'INVALID_ROOM_CODE',
    });
  });
});
