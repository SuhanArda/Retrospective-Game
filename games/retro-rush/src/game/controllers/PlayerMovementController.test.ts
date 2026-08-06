import { describe, expect, it } from 'vitest';
import { applyJumpCut, calculateMaximumJumpHeight, clampDeltaSeconds, createJumpState, recordJumpPress, resetJumpState, tryStartJump, updateGroundedState } from './PlayerMovementController';

describe('player movement rules', () => {
  it('supports grounded, buffered, and one-use coyote jumps', () => {
    const state = createJumpState();
    expect(updateGroundedState(state, 100, true, false)).toBe(true);
    recordJumpPress(state, 110); expect(tryStartJump(state, 110, true, 120, 140)).toBe(true);
    recordJumpPress(state, 120); expect(tryStartJump(state, 120, false, 120, 140)).toBe(false);
    updateGroundedState(state, 200, false, true); recordJumpPress(state, 250);
    expect(tryStartJump(state, 250, false, 120, 140)).toBe(true);
  });

  it('expires coyote time and jump buffering', () => {
    const state = createJumpState(); updateGroundedState(state, 0, true, false); recordJumpPress(state, 200);
    expect(tryStartJump(state, 200, false, 120, 140)).toBe(false);
    updateGroundedState(state, 300, true, false); recordJumpPress(state, 100);
    expect(tryStartJump(state, 300, true, 120, 140)).toBe(false);
  });

  it('cuts only input-started upward jumps and resets on respawn', () => {
    const state = createJumpState(); state.jumpStartedByInput = true;
    expect(applyJumpCut(state, -600, true, 0.55)).toBe(-330);
    expect(applyJumpCut(state, -300, true, 0.55)).toBe(-300);
    state.jumpStartedByInput = true; expect(applyJumpCut(state, 200, true, 0.55)).toBe(200);
    resetJumpState(state); expect(state.coyoteAvailable).toBe(false);
  });

  it('clamps large deltas and preserves the audited jump arc', () => {
    expect(clampDeltaSeconds(200, 0.05)).toBe(0.05);
    expect(calculateMaximumJumpHeight(610, 1600)).toBeCloseTo(116.28, 1);
  });
});
