import { describe, expect, it } from 'vitest';
import type { PlayerSnapshot } from '../../domain/types';
import { calculateHomingVelocity, canRocketHitPlayer, findNearestRocketTarget, resolveRocketHit, rotateAngleTowards, velocityTowards, type RocketSnapshot } from './RocketLifecycle';
import { gameplayConfig } from '../../data/gameplayConfig';

const player = (state: PlayerSnapshot['state'] = 'ACTIVE'): PlayerSnapshot => ({ id: 'target', name: 'Target', state, isLocal: false, color: 0, icon: '', checkpointId: 'start', eliminations: 0, answers: 0 });

describe('rocket lifecycle', () => {
  it('accepts a hit exactly once', () => {
    const rocket: RocketSnapshot = { ownerId: 'owner', state: 'ACTIVE' };
    expect(resolveRocketHit(rocket, player())).toBe(true);
    expect(resolveRocketHit(rocket, player())).toBe(false);
    expect(rocket.state).toBe('HIT');
  });

  it.each(['INVULNERABLE', 'RESPAWNING', 'ANSWERING_QUESTION', 'FALLEN', 'FINISHED', 'DISCONNECTED'] as const)('rejects %s targets', (state) => {
    expect(canRocketHitPlayer({ ownerId: 'owner', state: 'ACTIVE' }, player(state))).toBe(false);
  });

  it('rejects the owner', () => {
    expect(canRocketHitPlayer({ ownerId: 'target', state: 'ACTIVE' }, player())).toBe(false);
  });
});

describe('rocket targeting and steering', () => {
  const owner = { id: 'owner', state: 'ACTIVE' as const, x: 0, y: 0 };
  it('selects the nearest eligible target with stable ID tie-breaking', () => {
    const target = findNearestRocketTarget(owner, [
      { id: 'z', state: 'ACTIVE', x: 100, y: 0 }, { id: 'a', state: 'ACTIVE', x: -100, y: 0 },
      { id: 'near-but-safe', state: 'INVULNERABLE', x: 1, y: 0 }, owner,
    ], { maximumTargetDistance: 900 });
    expect(target?.id).toBe('a');
  });

  it('ignores invalid states and out-of-range targets', () => {
    const states = ['DISCONNECTED', 'FINISHED', 'ANSWERING_QUESTION', 'RESPAWNING', 'INVULNERABLE', 'FALLEN'] as const;
    expect(findNearestRocketTarget(owner, states.map((state, index) => ({ id: String(index), state, x: 10, y: 0 })), { maximumTargetDistance: 900 })).toBeUndefined();
    expect(findNearestRocketTarget(owner, [{ id: 'far', state: 'ACTIVE', x: 901, y: 0 }], { maximumTargetDistance: 900 })).toBeUndefined();
  });

  it('creates finite initial velocity, including zero distance', () => {
    expect(velocityTowards(owner, { x: 0, y: 100 }, 500)).toEqual({ x: 0, y: 500 });
    expect(velocityTowards(owner, owner, 500)).toEqual({ x: 500, y: 0 });
  });

  it('wraps angles and caps homing rotation without snapping', () => {
    expect(rotateAngleTowards(Math.PI - 0.1, -Math.PI + 0.1, 0.05)).toBeCloseTo(Math.PI - 0.05);
    const velocity = calculateHomingVelocity({ x: 500, y: 0 }, owner, { x: 0, y: 100 }, 500, 1, 0.1);
    expect(Math.atan2(velocity.y, velocity.x)).toBeCloseTo(0.1);
  });

  it('can close the full targeting range against a player running away', () => {
    const relativeSpeed = gameplayConfig.rocket.speed - gameplayConfig.player.maxRunSpeed;
    expect(relativeSpeed * gameplayConfig.rocket.lifetimeMs / 1000).toBeGreaterThanOrEqual(gameplayConfig.rocket.maximumTargetDistance);
  });
});
