import { describe, expect, it } from 'vitest';
import { advanceTankPosition, createSmoothedTankPosition, retargetTankPosition } from './TankMotionSmoother';

describe('TankMotionSmoother', () => {
  it('eases toward authoritative coordinates instead of snapping', () => {
    const position = createSmoothedTankPosition(100, 400);
    retargetTankPosition(position, 112, 388);

    advanceTankPosition(position, 16, 70, 40);
    expect(position.x).toBeGreaterThan(100);
    expect(position.x).toBeLessThan(112);
    expect(position.y).toBeLessThan(400);
    expect(position.y).toBeGreaterThan(388);

    for (let frame = 0; frame < 40; frame++) advanceTankPosition(position, 16, 70, 40);
    expect(position.x).toBeCloseTo(112, 1);
    expect(position.y).toBeCloseTo(388, 1);
  });

  it('changes direction smoothly and can snap on round reset', () => {
    const position = createSmoothedTankPosition(100, 400);
    retargetTankPosition(position, 124, 400);
    advanceTankPosition(position, 32, 70, 40);
    const movingRightAt = position.x;

    retargetTankPosition(position, 88, 405);
    advanceTankPosition(position, 16, 70, 40);
    expect(position.x).toBeGreaterThan(88);
    expect(position.x).not.toBe(movingRightAt);

    retargetTankPosition(position, 200, 300, true);
    expect(position).toMatchObject({ x: 200, y: 300, targetX: 200, targetY: 300, velocityX: 0, velocityY: 0 });
  });
});
