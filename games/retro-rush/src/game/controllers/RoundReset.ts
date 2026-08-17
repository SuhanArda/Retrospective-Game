import type { PlayerSnapshot, Point } from '../../domain/types';

export function roundSpawnPosition(spawn: Point) {
  return { x: spawn.x, y: spawn.y };
}

export function resetPlayerSnapshotForRound(snapshot: PlayerSnapshot): PlayerSnapshot {
  return {
    id: snapshot.id,
    name: snapshot.name,
    isLocal: snapshot.isLocal,
    color: snapshot.color,
    icon: snapshot.icon,
    state: 'ACTIVE',
    checkpointId: 'start',
    eliminations: 0,
    answers: 0,
  };
}
