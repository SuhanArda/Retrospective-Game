import { describe, expect, it } from 'vitest';
import type { PlayerSnapshot } from '../../domain/types';
import { resetPlayerSnapshotForRound, roundSpawnPosition } from './RoundReset';

describe('round reset values', () => {
  it('returns every player to the original map spawn without checkpoint selection', () => {
    expect(roundSpawnPosition({ x: 180, y: 540 }, 0)).toEqual({ x: 180, y: 540 });
    expect(roundSpawnPosition({ x: 180, y: 540 }, 2)).toEqual({ x: 88, y: 540 });
  });

  it('clears round state while preserving player and session identity fields', () => {
    const player: PlayerSnapshot = { id: 'player-42', name: 'Ada', state: 'FINISHED', isLocal: true, color: 7, icon: 'A', checkpointId: 'cp4', eliminations: 3, answers: 2, finishPosition: 1 };
    expect(resetPlayerSnapshotForRound(player)).toEqual({ id: 'player-42', name: 'Ada', state: 'ACTIVE', isLocal: true, color: 7, icon: 'A', checkpointId: 'start', eliminations: 0, answers: 0 });
  });
});
