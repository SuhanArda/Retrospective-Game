import { describe, expect, it } from 'vitest';
import type { RetroRushPlayerSnapshot } from '@retro-platform/contracts';
import { RemotePlayerInterpolator } from './RemotePlayerInterpolator';

const snapshot = (sequence: number, x: number, roundId = 1): RetroRushPlayerSnapshot => ({
  playerId: 'remote', displayName: 'Remote', color: '#ffffff', slot: 1, skinIndex: 1,
  connected: true, x, y: 100, velocityX: 20, velocityY: 0, facing: 'right',
  movementState: 'ACTIVE', animationState: 'running', sequence, clientTimestamp: sequence * 50, roundId,
  ownedAbilityIds: [],
});

describe('RemotePlayerInterpolator', () => {
  it('smoothly samples buffered snapshots without moving the local player path', () => {
    const interpolation = new RemotePlayerInterpolator(100);
    interpolation.push(snapshot(1, 0), 100);
    interpolation.push(snapshot(2, 100), 200);
    expect(interpolation.sample(250)?.x).toBe(50);
  });

  it('ignores duplicate and out-of-order snapshots and resets for a new round', () => {
    const interpolation = new RemotePlayerInterpolator(0);
    expect(interpolation.push(snapshot(2, 20), 100)).toBe(true);
    expect(interpolation.push(snapshot(1, 10), 110)).toBe(false);
    expect(interpolation.push(snapshot(1, 200, 2), 120)).toBe(true);
    expect(interpolation.sample(120)?.x).toBe(200);
    expect(interpolation.push(snapshot(99, 999, 1), 130)).toBe(false);
  });

  it('clears the old interpolation target before the authoritative round spawn', () => {
    const interpolation = new RemotePlayerInterpolator(100);
    interpolation.push(snapshot(50, 900), 100);
    interpolation.reset(2);
    expect(interpolation.sample(200)).toBeNull();
    expect(interpolation.push(snapshot(1, 180, 2), 210)).toBe(true);
    expect(interpolation.sample(210)?.x).toBe(180);
  });
});
