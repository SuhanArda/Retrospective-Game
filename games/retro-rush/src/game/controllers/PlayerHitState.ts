export interface PlayerHitState {
  hitStunEndsAt: number;
}

export function createPlayerHitState(): PlayerHitState { return { hitStunEndsAt: Number.NEGATIVE_INFINITY }; }

export function beginHitStun(state: PlayerHitState, now: number, durationMs: number) {
  state.hitStunEndsAt = now + Math.max(0, durationMs);
}

export function isInHitStun(state: PlayerHitState, now: number) {
  return now < state.hitStunEndsAt;
}

export function updateHitStun(state: PlayerHitState, now: number) {
  if (isInHitStun(state, now)) return true;
  state.hitStunEndsAt = Number.NEGATIVE_INFINITY;
  return false;
}

export function resetHitStun(state: PlayerHitState) { state.hitStunEndsAt = Number.NEGATIVE_INFINITY; }

export function fixedLeftKnockbackVelocity(currentVelocityY: number, knockbackX: number) {
  return {
    x: Number.isFinite(knockbackX) ? -Math.abs(knockbackX) : 0,
    y: Number.isFinite(currentVelocityY) ? currentVelocityY : 0,
  };
}
