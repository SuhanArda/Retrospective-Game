import type { WheelSpinSnapshot } from '@retro-platform/contracts';

export interface WheelLabelGeometry {
  xPercent: number;
  yPercent: number;
  centerAngleDeg: number;
}

/** Optical midpoint between the 21% hub and the inner edge of the outer ring. */
export const WHEEL_LABEL_RADIUS_RATIO = 0.61;

export function segmentCenterAngle(index: number, itemCount: number): number {
  if (itemCount <= 0) return -90;
  return -90 + (index + 0.5) * (360 / itemCount);
}

export function wheelLabelGeometry(
  index: number,
  itemCount: number,
  radiusRatio = WHEEL_LABEL_RADIUS_RATIO,
): WheelLabelGeometry {
  const centerAngleDeg = segmentCenterAngle(index, itemCount);
  const radians = centerAngleDeg * Math.PI / 180;
  const radiusPercent = 50 * radiusRatio;
  return {
    xPercent: 50 + Math.cos(radians) * radiusPercent,
    yPercent: 50 + Math.sin(radians) * radiusPercent,
    centerAngleDeg,
  };
}

/** Width of the usable chord at the label radius, kept clear of both slice dividers. */
export function wheelLabelWidthPercent(itemCount: number): number {
  if (itemCount <= 0) return 0;
  const radiusPercent = 50 * WHEEL_LABEL_RADIUS_RATIO;
  const halfSegmentRadians = Math.PI / itemCount;
  const chordPercent = 2 * radiusPercent * Math.sin(halfSegmentRadians);
  return Math.min(36, Math.max(16, chordPercent * 0.84));
}

function normalizeSignedAngle(angle: number): number {
  return ((angle + 180) % 360 + 360) % 360 - 180;
}

/** Tangential labels follow their slice, but flip on the left half so text is never upside down. */
export function readableLabelRotation(centerAngleDeg: number, wheelRotationDeg: number): number {
  let screenRotation = normalizeSignedAngle(centerAngleDeg + wheelRotationDeg + 90);
  if (screenRotation > 90) screenRotation -= 180;
  if (screenRotation < -90) screenRotation += 180;
  return screenRotation - wheelRotationDeg;
}

export function truncateWheelLabel(label: string, itemCount: number): string {
  const maximum = itemCount <= 3 ? 16 : itemCount <= 5 ? 14 : itemCount <= 8 ? 11 : 9;
  return label.length <= maximum ? label : `${label.slice(0, maximum - 1)}…`;
}

export function spinProgress(spin: WheelSpinSnapshot, now: number): number {
  return Math.max(0, Math.min(1, (now - spin.startedAtUnixMs) / spin.durationMs));
}

export function wheelRotation(spin: WheelSpinSnapshot, itemCount: number, now: number): number {
  if (itemCount <= 0) return 0;
  const landing = -90 - segmentCenterAngle(spin.selectedIndex, itemCount);
  const target = 6 * 360 + landing;
  const progress = spinProgress(spin, now);
  const eased = 1 - Math.pow(1 - progress, 4);
  return target * eased;
}
