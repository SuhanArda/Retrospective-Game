import { describe, expect, it } from 'vitest';
import { gameSelectionSecondsRemaining } from './gameSelectionTimer';

describe('authoritative game-selection timer', () => {
  it('shows the host-selected duration and decreases from the shared deadline', () => {
    const deadline = 40_000;
    expect(gameSelectionSecondsRemaining(deadline, 10_000)).toBe(30);
    expect(gameSelectionSecondsRemaining(deadline, 10_001)).toBe(30);
    expect(gameSelectionSecondsRemaining(deadline, 11_001)).toBe(29);
    expect(gameSelectionSecondsRemaining(deadline, 12_001)).toBe(28);
  });

  it('shows remaining time for a late snapshot instead of restarting the duration', () => {
    expect(gameSelectionSecondsRemaining(40_000, 20_000)).toBe(20);
  });

  it('reaches zero only when the authoritative deadline expires', () => {
    expect(gameSelectionSecondsRemaining(40_000, 39_999)).toBe(1);
    expect(gameSelectionSecondsRemaining(40_000, 40_000)).toBe(0);
    expect(gameSelectionSecondsRemaining(40_000, 41_000)).toBe(0);
    expect(gameSelectionSecondsRemaining(undefined, 10_000)).toBe(0);
  });
});
