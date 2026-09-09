import type { TankBattleShotSnapshot } from '@retro-platform/contracts';
import { describe, expect, it } from 'vitest';
import { planProjectileVisualSync } from './ProjectileVisualSync';

const active = {
  shotId: 'shot-1',
  status: 'ACTIVE',
} as TankBattleShotSnapshot;

describe('projectile visual synchronization', () => {
  it('creates an active projectile once and updates it on later snapshots', () => {
    expect(planProjectileVisualSync(new Set(), [active])).toMatchObject({ create: [active], update: [] });
    expect(planProjectileVisualSync(new Set(['shot-1']), [active])).toMatchObject({ create: [], update: [active] });
  });

  it('finishes resolved projectiles and removes disappeared projectiles', () => {
    const impacted = { ...active, status: 'IMPACTED' as const };
    expect(planProjectileVisualSync(new Set(['shot-1']), [impacted])).toMatchObject({ finish: [impacted] });
    expect(planProjectileVisualSync(new Set(['shot-1']), [])).toMatchObject({ remove: ['shot-1'] });
  });
});
