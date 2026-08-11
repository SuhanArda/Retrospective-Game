import type { Platform } from '../map/mapTypes';

export interface ReachabilityMovementConfig {
  gravity: number;
  jumpVelocity: number;
  maxRunSpeed: number;
  airborneControlMultiplier: number;
}

export interface ReachabilityLimits {
  theoreticalMaximumJumpHeight: number;
  theoreticalHorizontalReach: number;
  maximumSafeVerticalRise: number;
  maximumSafeHorizontalGap: number;
}

export function platformTop(platform: Platform) { return platform.y - platform.height / 2; }

export function requiredVerticalRise(from: Platform, to: Platform) {
  return Math.max(0, platformTop(from) - platformTop(to));
}

export function horizontalEdgeGap(from: Platform, to: Platform) {
  return Math.max(0, to.x - (from.x + from.width));
}

export function descendingLandingTime(jumpVelocity: number, gravity: number, verticalRise: number) {
  const discriminant = jumpVelocity ** 2 - 2 * gravity * verticalRise;
  return discriminant < 0 ? Number.POSITIVE_INFINITY : (jumpVelocity + Math.sqrt(discriminant)) / gravity;
}

export function calculateReachabilityLimits(movement: ReachabilityMovementConfig, safetyFactor: number): ReachabilityLimits {
  const theoreticalMaximumJumpHeight = movement.jumpVelocity ** 2 / (2 * movement.gravity);
  const theoreticalHorizontalReach = movement.maxRunSpeed
    * movement.airborneControlMultiplier
    * descendingLandingTime(movement.jumpVelocity, movement.gravity, 0);
  return {
    theoreticalMaximumJumpHeight,
    theoreticalHorizontalReach,
    maximumSafeVerticalRise: theoreticalMaximumJumpHeight * safetyFactor,
    maximumSafeHorizontalGap: theoreticalHorizontalReach * safetyFactor,
  };
}

export function maximumReachableGapForRise(
  verticalRise: number,
  movement: ReachabilityMovementConfig,
  safetyFactor: number,
) {
  const landingTime = descendingLandingTime(movement.jumpVelocity, movement.gravity, verticalRise);
  return Number.isFinite(landingTime)
    ? movement.maxRunSpeed * movement.airborneControlMultiplier * landingTime * safetyFactor
    : 0;
}

export function isPlatformReachable(
  from: Platform,
  to: Platform,
  movement: ReachabilityMovementConfig,
  safetyFactor: number,
) {
  const rise = requiredVerticalRise(from, to);
  const limits = calculateReachabilityLimits(movement, safetyFactor);
  if (rise > limits.maximumSafeVerticalRise) return false;
  return horizontalEdgeGap(from, to) <= maximumReachableGapForRise(rise, movement, safetyFactor);
}
