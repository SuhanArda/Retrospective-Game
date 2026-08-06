import type { Platform } from '../map/mapTypes';

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
