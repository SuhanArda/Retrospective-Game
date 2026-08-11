import { describe, expect, it } from 'vitest';
import type { PlayerState } from '../../domain/types';
import { canAttemptPlayerShove, findShoveTarget, PlayerShoveController, shoveVelocityAwayFrom, type PositionedShovePlayer } from './PlayerShoveController';

const config = { range: 55, horizontalVelocity: 300, cooldownMs: 600, hitStunMs: 150 };
const player = (id: string, x: number, state: PlayerState = 'ACTIVE', y = 100): PositionedShovePlayer => ({ id, x, y, state });

describe('player shove targeting', () => {
  it('accepts gameplay clicks only while the match and local player are active', () => {
    expect(canAttemptPlayerShove('RUNNING', 'ACTIVE', true)).toBe(true);
    expect(canAttemptPlayerShove('COUNTDOWN', 'ACTIVE', true)).toBe(false);
    expect(canAttemptPlayerShove('RUNNING', 'ANSWERING_QUESTION', true)).toBe(false);
    expect(canAttemptPlayerShove('RUNNING', 'ACTIVE', false)).toBe(false);
  });
  it('selects the nearest active player in front by stable id', () => {
    const source = player('local', 100);
    expect(findShoveTarget(source, [source, player('far', 180), player('behind', 70), player('z', 140), player('a', 140)], 1, config)?.id).toBe('a');
  });

  it('does not select self, distant, fallen, answering, invulnerable, respawning, finished, or disconnected players', () => {
    const source = player('local', 100);
    const states: PlayerState[] = ['FALLEN', 'ANSWERING_QUESTION', 'INVULNERABLE', 'RESPAWNING', 'FINISHED', 'DISCONNECTED'];
    const candidates = [source, player('distant', 156), ...states.map((state, index) => player(`${state}-${index}`, 110 + index, state))];
    expect(findShoveTarget(source, candidates, 1, config)).toBeUndefined();
  });

  it('uses world-space distance, including vertical separation', () => {
    expect(findShoveTarget(player('local', 100), [player('high', 110, 'ACTIVE', 160)], 1, config)).toBeUndefined();
  });

  it('pushes right and left targets away from the source', () => {
    const source = player('local', 100);
    expect(shoveVelocityAwayFrom(source, player('right', 120), config.horizontalVelocity)).toBe(300);
    expect(shoveVelocityAwayFrom(source, player('left', 80), config.horizontalVelocity)).toBe(-300);
  });
});

describe('player shove cooldown', () => {
  it('applies once, prevents spam, then recovers after the configured cooldown', () => {
    const controller = new PlayerShoveController(config);
    expect(controller.markApplied(1_000)).toBe(true);
    expect(controller.markApplied(1_599)).toBe(false);
    expect(controller.markApplied(1_600)).toBe(true);
    controller.reset();
    expect(controller.markApplied(1_601)).toBe(true);
  });
});
