import type { TankBattleShotSnapshot } from '@retro-platform/contracts';
import { describe, expect, it } from 'vitest';
import { projectilePositionAt } from './ProjectileMotion';

const shot: TankBattleShotSnapshot = {
  shotId: 'shot-1',
  ownerPlayerId: 'player-1',
  angle: 45,
  power: 300,
  launch: { x: 100, y: 400 },
  velocity: { x: 200, y: -200 },
  gravity: 360,
  path: [{ x: 100, y: 400 }, { x: 300, y: 380 }],
  impact: { x: 350, y: 450 },
  firedAtUnixMs: 10_000,
  impactAtUnixMs: 11_500,
  status: 'ACTIVE',
  impactType: 'TERRAIN',
};

describe('projectile motion', () => {
  it('progresses smoothly from authoritative launch kinematics', () => {
    expect(projectilePositionAt(shot, 10_000)).toMatchObject({ x: 100, y: 400, reachedImpact: false });
    expect(projectilePositionAt(shot, 10_500)).toMatchObject({ x: 200, y: 345, reachedImpact: false });
    expect(projectilePositionAt(shot, 11_000)).toMatchObject({ x: 300, y: 380, reachedImpact: false });
  });

  it('starts a late client at the current point instead of replaying launch', () => {
    const late = projectilePositionAt(shot, 10_900);
    expect(late.x).toBeGreaterThan(shot.launch.x);
    expect(late).not.toMatchObject(shot.launch);
  });

  it('clamps at the authoritative impact while waiting for resolution', () => {
    expect(projectilePositionAt(shot, 11_500)).toMatchObject({ ...shot.impact, reachedImpact: true });
    expect(projectilePositionAt(shot, 20_000)).toMatchObject({ ...shot.impact, reachedImpact: true });
  });
});
