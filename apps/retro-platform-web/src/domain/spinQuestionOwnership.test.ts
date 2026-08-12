import { describe, expect, it } from 'vitest';
import { canControlSpinQuestion, type SpinBottleStateSnapshot } from '@retro-platform/contracts';

describe('Spin question controls', () => {
  const state: SpinBottleStateSnapshot = {
    spinId: 'spin-1', spinnerPlayerId: 'host', targetPlayerId: 'ali', targetIndex: 1,
    status: 'QUESTION_ACTIVE', revision: 4, updatedAtUtc: 1,
  };

  it('grants controls by target player id, not host or display name', () => {
    expect(canControlSpinQuestion(state, 'ali')).toBe(true);
    expect(canControlSpinQuestion(state, 'host')).toBe(false);
    expect(canControlSpinQuestion(state, undefined)).toBe(false);
  });
});
