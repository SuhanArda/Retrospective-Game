import { describe, expect, it } from 'vitest';
import { isValidRoomCode, normalizeRoomCode } from './roomCode';

describe('room codes', () => {
  it('normalizes whitespace and casing', () => {
    expect(normalizeRoomCode('  abC123  ')).toBe('ABC123');
  });

  it('accepts exactly six alphanumeric characters', () => {
    expect(isValidRoomCode('ABC123')).toBe(true);
    expect(isValidRoomCode('ABC12')).toBe(false);
    expect(isValidRoomCode('ABC-12')).toBe(false);
  });
});
