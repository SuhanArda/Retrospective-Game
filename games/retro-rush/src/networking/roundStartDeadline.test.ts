import { describe, expect, it } from 'vitest';
import { canSendRoundGameplay, isRoundStartLocked, remainingRoundStartSeconds } from './roundStartDeadline';

describe('authoritative round start deadline', () => {
  it('keeps every client locked until the shared Unix deadline', () => {
    const deadline = 10_000;

    expect(isRoundStartLocked(1, deadline, 9_999)).toBe(true);
    expect(canSendRoundGameplay(1, 1, deadline, 9_999)).toBe(false);
    expect(isRoundStartLocked(1, deadline, deadline)).toBe(false);
    expect(canSendRoundGameplay(1, 1, deadline, deadline)).toBe(true);
  });

  it('rejects missing authority and stale-round gameplay', () => {
    expect(isRoundStartLocked(0, 10_000, 20_000)).toBe(true);
    expect(isRoundStartLocked(1, 0, 20_000)).toBe(true);
    expect(canSendRoundGameplay(2, 1, 10_000, 20_000)).toBe(false);
  });

  it('derives display seconds from the deadline instead of decrement messages', () => {
    expect(remainingRoundStartSeconds(13_500, 10_000)).toBe(4);
    expect(remainingRoundStartSeconds(13_500, 10_500)).toBe(3);
    expect(remainingRoundStartSeconds(13_500, 13_500)).toBe(0);
  });
});
