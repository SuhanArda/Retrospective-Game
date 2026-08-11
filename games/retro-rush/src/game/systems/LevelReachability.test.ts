import { describe, expect, it } from 'vitest';
import { gameplayConfig } from '../../data/gameplayConfig';
import type { Platform } from '../map/mapTypes';
import {
  calculateReachabilityLimits,
  horizontalEdgeGap,
  isPlatformReachable,
  maximumReachableGapForRise,
  requiredVerticalRise,
} from './LevelReachability';

const movement = gameplayConfig.player;
const safety = gameplayConfig.proceduralMap.reachabilitySafetyFactor;
const from: Platform = { id: 'from', x: 0, y: 640, width: 300, height: 40 };

describe('platform reachability', () => {
  it('derives safe limits from the unchanged movement configuration', () => {
    const limits = calculateReachabilityLimits(movement, safety);
    expect(limits.theoreticalMaximumJumpHeight).toBeCloseTo(150.89, 2);
    expect(limits.theoreticalHorizontalReach).toBeCloseTo(251.27, 2);
    expect(limits.maximumSafeVerticalRise).toBeCloseTo(113.17, 2);
    expect(limits.maximumSafeHorizontalGap).toBeCloseTo(188.45, 2);
    expect(gameplayConfig.player).toMatchObject({ gravity: 1_400, jumpVelocity: 650, maxRunSpeed: 330, airborneControlMultiplier: 0.82 });
  });

  it('accounts for platform edges and height', () => {
    const to: Platform = { id: 'to', x: 370, y: 580, width: 220, height: 40 };
    expect(horizontalEdgeGap(from, to)).toBe(70);
    expect(requiredVerticalRise(from, to)).toBe(60);
    expect(isPlatformReachable(from, to, movement, safety)).toBe(true);
  });

  it('rejects a high and far combination even when each independent maximum looks safe', () => {
    const rise = 100;
    const combinedGap = maximumReachableGapForRise(rise, movement, safety);
    const to: Platform = { id: 'to', x: from.x + from.width + combinedGap + 1, y: from.y - rise, width: 220, height: 40 };
    expect(rise).toBeLessThan(gameplayConfig.proceduralMap.maximumSafeVerticalRise);
    expect(horizontalEdgeGap(from, to)).toBeLessThan(gameplayConfig.proceduralMap.maximumSafeGap);
    expect(isPlatformReachable(from, to, movement, safety)).toBe(false);
  });

  it('rejects rises above the vertical safety margin', () => {
    const to: Platform = { id: 'to', x: 300, y: from.y - gameplayConfig.proceduralMap.maximumSafeVerticalRise - 1, width: 220, height: 40 };
    expect(isPlatformReachable(from, to, movement, safety)).toBe(false);
  });
});
