import { describe, expect, it } from 'vitest';
import {
  readableLabelRotation,
  segmentCenterAngle,
  spinProgress,
  truncateWheelLabel,
  wheelLabelGeometry,
  wheelLabelWidthPercent,
  wheelRotation,
} from './wheelMath';

const spin = { spinId: 's', selectedId: 'b', selectedIndex: 1, startedAtUnixMs: 1_000, durationMs: 4_000 };

describe('authoritative wheel animation', () => {
  it('resumes from server time instead of restarting', () => {
    expect(spinProgress(spin, 3_000)).toBe(0.5);
    expect(wheelRotation(spin, 4, 3_000)).toBeGreaterThan(1_000);
  });

  it('lands the selected segment under the pointer', () => {
    expect(wheelRotation(spin, 4, 5_000) % 360).toBe(225);
    expect((segmentCenterAngle(spin.selectedIndex, 4) + wheelRotation(spin, 4, 5_000)) % 360).toBe(270);
  });

  it.each([2, 3, 4, 6, 8, 10])('places %i player labels at slice centers inside the wheel', (count) => {
    const points = Array.from({ length: count }, (_, index) => wheelLabelGeometry(index, count));
    expect(new Set(points.map((point) => `${point.xPercent.toFixed(3)}:${point.yPercent.toFixed(3)}`)).size).toBe(count);
    expect(points.every((point) => point.xPercent >= 19.5 && point.xPercent <= 80.5)).toBe(true);
    expect(points.every((point) => point.yPercent >= 19.5 && point.yPercent <= 80.5)).toBe(true);
    expect(points.every((point) => {
      const distanceFromCenter = Math.hypot(point.xPercent - 50, point.yPercent - 50);
      return Math.abs(distanceFromCenter - 30.5) < 0.0001;
    })).toBe(true);
    expect(wheelLabelWidthPercent(count)).toBeGreaterThanOrEqual(16);
    expect(wheelLabelWidthPercent(count)).toBeLessThanOrEqual(36);
  });

  it('keeps tangential text upright and truncates only its visual label', () => {
    for (let index = 0; index < 10; index++) {
      const center = segmentCenterAngle(index, 10);
      const screenRotation = readableLabelRotation(center, 0);
      expect(screenRotation).toBeGreaterThanOrEqual(-90);
      expect(screenRotation).toBeLessThanOrEqual(90);
    }
    expect(truncateWheelLabel('MehmetcanUzunKullaniciAdi', 8)).toBe('MehmetcanU…');
    expect(truncateWheelLabel('Ayşe', 10)).toBe('Ayşe');
  });
});
