import type { TankBattlePoint, TankBattleShotSnapshot } from '@retro-platform/contracts';

export const PROJECTILE_GRAVITY = 360;
export const PROJECTILE_STEP_MS = 40;

export interface ProjectileSample extends TankBattlePoint {
  angleRadians: number;
  reachedImpact: boolean;
}

export function createProjectileLaunch(
  tankX: number,
  tankY: number,
  facing: 'LEFT' | 'RIGHT',
  angle: number,
  power: number,
): Pick<TankBattleShotSnapshot, 'launch' | 'velocity' | 'gravity'> {
  const direction = facing === 'RIGHT' ? 1 : -1;
  const radians = angle * Math.PI / 180;
  const pivotX = tankX + direction * 2;
  const pivotY = tankY - 15;
  return {
    launch: {
      x: pivotX + Math.cos(radians) * 28 * direction,
      y: pivotY - Math.sin(radians) * 28,
    },
    velocity: {
      x: Math.cos(radians) * power * direction,
      y: -Math.sin(radians) * power,
    },
    gravity: PROJECTILE_GRAVITY,
  };
}

export function projectilePositionAt(shot: TankBattleShotSnapshot, serverNowUnixMs: number): ProjectileSample {
  const reachedImpact = serverNowUnixMs >= shot.impactAtUnixMs;
  if (reachedImpact) {
    const flightSeconds = Math.max(0, shot.impactAtUnixMs - shot.firedAtUnixMs) / 1_000;
    return {
      ...shot.impact,
      angleRadians: Math.atan2(shot.velocity.y + shot.gravity * flightSeconds, shot.velocity.x),
      reachedImpact: true,
    };
  }

  const elapsedSeconds = Math.max(0, serverNowUnixMs - shot.firedAtUnixMs) / 1_000;
  const velocityY = shot.velocity.y + shot.gravity * elapsedSeconds;
  return {
    x: shot.launch.x + shot.velocity.x * elapsedSeconds,
    y: shot.launch.y + shot.velocity.y * elapsedSeconds
      + 0.5 * shot.gravity * elapsedSeconds * elapsedSeconds,
    angleRadians: Math.atan2(velocityY, shot.velocity.x),
    reachedImpact: false,
  };
}
