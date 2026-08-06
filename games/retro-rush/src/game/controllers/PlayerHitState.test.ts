import { describe, expect, it } from 'vitest';
import { beginHitStun, createPlayerHitState, fixedLeftKnockbackVelocity, isInHitStun, resetHitStun, updateHitStun } from './PlayerHitState';

describe('fixed left rocket knockback', () => {
  it.each([500, -500, 0])('is negative regardless of rocket travel direction %s', () => {
    expect(fixedLeftKnockbackVelocity(75, 450)).toEqual({ x: -450, y: 75 });
  });

  it('preserves upward, downward, and stationary vertical velocity', () => {
    expect(fixedLeftKnockbackVelocity(-240, 450).y).toBe(-240);
    expect(fixedLeftKnockbackVelocity(180, 450).y).toBe(180);
    expect(fixedLeftKnockbackVelocity(0, 450).y).toBe(0);
  });

  it('keeps horizontal control blocked only for the configured duration', () => {
    const state = createPlayerHitState();
    beginHitStun(state, 1_000, 250);
    expect(isInHitStun(state, 1_249)).toBe(true);
    expect(updateHitStun(state, 1_250)).toBe(false);
    expect(isInHitStun(state, 1_251)).toBe(false);
  });

  it('clears stale hit stun on respawn or elimination', () => {
    const state = createPlayerHitState(); beginHitStun(state, 100, 250); resetHitStun(state);
    expect(isInHitStun(state, 101)).toBe(false);
  });
});
