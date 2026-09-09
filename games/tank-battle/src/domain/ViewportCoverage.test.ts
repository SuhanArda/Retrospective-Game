import { describe, expect, it } from 'vitest';
import { calculateCameraTargetX, calculateViewportCoverage } from './ViewportCoverage';

describe('viewport coverage', () => {
  it('extends both sides for an ultrawide camera without cropping the map', () => {
    const coverage = calculateViewportCoverage(1680, 720, 1280, 720, 48);
    expect(coverage).toMatchObject({ left: -248, right: 1528, top: -48, bottom: 768 });
    expect(coverage.width).toBe(1776);
  });

  it('extends the vertical composition for a taller camera', () => {
    const coverage = calculateViewportCoverage(1280, 800, 1280, 720, 48);
    expect(coverage).toMatchObject({ left: -48, right: 1328, top: -88, bottom: 808 });
    expect(coverage.height).toBe(896);
  });

  it('centers a wide map on the local tank while clamping its edges', () => {
    expect(calculateCameraTargetX(240, 1280, 2560)).toBe(640);
    expect(calculateCameraTargetX(1400, 1280, 2560)).toBe(1400);
    expect(calculateCameraTargetX(2380, 1280, 2560)).toBe(1920);
    expect(calculateCameraTargetX(240, 1680, 1280)).toBe(640);
  });
});
