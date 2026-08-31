import type { TankBattleShotSnapshot } from '@retro-platform/contracts';

export interface ProjectileVisualSyncPlan {
  create: readonly TankBattleShotSnapshot[];
  update: readonly TankBattleShotSnapshot[];
  finish: readonly TankBattleShotSnapshot[];
  remove: readonly string[];
}

export function planProjectileVisualSync(
  visualIds: ReadonlySet<string>,
  shots: readonly TankBattleShotSnapshot[],
): ProjectileVisualSyncPlan {
  const snapshotIds = new Set(shots.map((shot) => shot.shotId));
  const create: TankBattleShotSnapshot[] = [];
  const update: TankBattleShotSnapshot[] = [];
  const finish: TankBattleShotSnapshot[] = [];

  for (const shot of shots) {
    if (shot.status === 'ACTIVE') {
      (visualIds.has(shot.shotId) ? update : create).push(shot);
    } else if (visualIds.has(shot.shotId)) {
      finish.push(shot);
    }
  }

  return {
    create,
    update,
    finish,
    remove: [...visualIds].filter((shotId) => !snapshotIds.has(shotId)),
  };
}
