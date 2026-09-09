import { describe, expect, it } from 'vitest';
import { computeAim, previewTrajectory } from './aiming';

describe('directional tank aiming', () => {
  it('uses the current facing instead of the team to project a shot', () => {
    const right = previewTrajectory(400, 400, 'RIGHT', 20, 300);
    const left = previewTrajectory(400, 400, 'LEFT', 20, 300);
    expect(right[2]!.x).toBeGreaterThan(400);
    expect(left[2]!.x).toBeLessThan(400);
  });

  it('supports a downward barrel angle when the pointer is below the tank', () => {
    const aim = computeAim(400, 300, 560, 390, 'RIGHT');
    expect(aim.angle).toBeLessThan(0);
    const path = previewTrajectory(400, 300, 'RIGHT', aim.angle, aim.power);
    expect(path[1]!.y).toBeGreaterThan(path[0]!.y);
  });

  it('calculates the angle from the same turret pivot used by the barrel and projectile', () => {
    const aim = computeAim(400, 300, 500, 250, 'RIGHT');
    const path = previewTrajectory(400, 300, 'RIGHT', aim.angle, aim.power);
    const pivot = { x: 402, y: 285 };
    const pointer = { x: 500, y: 250 };
    const barrel = { x: path[0]!.x - pivot.x, y: path[0]!.y - pivot.y };
    const target = { x: pointer.x - pivot.x, y: pointer.y - pivot.y };

    expect(barrel.x * target.y - barrel.y * target.x).toBeCloseTo(0, 10);
  });

  it('keeps a left-facing tank aimed left even if the pointer crosses behind it', () => {
    const aim = computeAim(400, 300, 500, 200, 'LEFT');
    const path = previewTrajectory(400, 300, 'LEFT', aim.angle, aim.power);
    expect(path[1]!.x).toBeLessThan(400);
  });
});
