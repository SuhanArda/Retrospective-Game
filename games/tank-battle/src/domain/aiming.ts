import type { TankBattlePoint } from '@retro-platform/contracts';
import { gameplayConfig } from '../data/gameplayConfig';
import { createProjectileLaunch } from './ProjectileMotion';

export type TankFacing = 'LEFT' | 'RIGHT';

export function computeAim(
  tankX: number,
  tankY: number,
  pointerX: number,
  pointerY: number,
  facing: TankFacing,
): { angle: number; power: number } {
  const direction = facing === 'RIGHT' ? 1 : -1;
  const pivotX = tankX + direction * 2;
  const pivotY = tankY - 15;
  const forwardDistance = Math.max(24, (pointerX - pivotX) * direction);
  const verticalDistance = pivotY - pointerY;
  const angle = clamp(
    Math.atan2(verticalDistance, forwardDistance) * 180 / Math.PI,
    gameplayConfig.shot.minAngle,
    gameplayConfig.shot.maxAngle,
  );
  const power = clamp(
    Math.hypot(forwardDistance, verticalDistance) * 1.25,
    gameplayConfig.shot.minPower,
    gameplayConfig.shot.maxPower,
  );
  return { angle, power };
}

export function previewTrajectory(
  tankX: number,
  tankY: number,
  facing: TankFacing,
  angle: number,
  power: number,
  pointCount = 13,
): readonly TankBattlePoint[] {
  const { launch, velocity, gravity } = createProjectileLaunch(tankX, tankY, facing, angle, power);
  return Array.from({ length: pointCount }, (_, index) => {
    const time = index * 0.11;
    return {
      x: launch.x + velocity.x * time,
      y: launch.y + velocity.y * time + 0.5 * gravity * time * time,
    };
  });
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
