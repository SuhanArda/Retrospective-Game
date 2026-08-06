export interface JumpState {
  lastGroundedAt: number;
  lastJumpPressedAt: number;
  coyoteAvailable: boolean;
  jumpStartedByInput: boolean;
}

export const createJumpState = (): JumpState => ({ lastGroundedAt: Number.NEGATIVE_INFINITY, lastJumpPressedAt: Number.NEGATIVE_INFINITY, coyoteAvailable: false, jumpStartedByInput: false });

export function updateGroundedState(state: JumpState, time: number, blockedDown: boolean, touchingDown: boolean) {
  const grounded = blockedDown || touchingDown;
  if (grounded) { state.lastGroundedAt = time; state.coyoteAvailable = true; state.jumpStartedByInput = false; }
  return grounded;
}

export function recordJumpPress(state: JumpState, time: number) { state.lastJumpPressedAt = time; }

export function tryStartJump(state: JumpState, time: number, grounded: boolean, coyoteTimeMs: number, jumpBufferMs: number) {
  const buffered = time - state.lastJumpPressedAt <= jumpBufferMs;
  const coyote = state.coyoteAvailable && time - state.lastGroundedAt <= coyoteTimeMs;
  if (!buffered || (!grounded && !coyote)) return false;
  state.lastJumpPressedAt = Number.NEGATIVE_INFINITY;
  state.coyoteAvailable = false;
  state.jumpStartedByInput = true;
  return true;
}

export function applyJumpCut(state: JumpState, velocityY: number, jumpReleased: boolean, multiplier: number) {
  if (!jumpReleased || velocityY >= 0 || !state.jumpStartedByInput) return velocityY;
  state.jumpStartedByInput = false;
  return velocityY * multiplier;
}

export function resetJumpState(state: JumpState) { Object.assign(state, createJumpState()); }
export function clampDeltaSeconds(deltaMs: number, maximum: number) { return Math.min(Math.max(deltaMs, 0) / 1000, maximum); }
export function calculateMaximumJumpHeight(jumpVelocity: number, gravity: number) { return jumpVelocity * jumpVelocity / (2 * gravity); }
