import { describe, expect, it } from 'vitest';
import { gameplayConfig } from '../../data/gameplayConfig';
import { sampleMap } from '../map/sampleMap';
import { calculateMaximumJumpHeight } from '../controllers/PlayerMovementController';
import { descendingLandingTime, horizontalEdgeGap, requiredVerticalRise } from './LevelReachability';

describe('ability pickup reachability', () => {
  const platforms = Object.fromEntries(sampleMap.platforms.map((platform) => [platform.id, platform]));
  const approaches: ReadonlyArray<{ pickup: string; from: string; via?: string; target: string }> = [
    { pickup: 'a1', from: 'g1', via: 'p1', target: 'p2' },
    { pickup: 'a2', from: 'p5', target: 'p6' },
    { pickup: 'a3', from: 'p9', target: 'p10' },
  ];

  it('provides a 15–30% full-jump margin over the highest required rise', () => {
    const height = calculateMaximumJumpHeight(gameplayConfig.player.jumpVelocity, gameplayConfig.player.gravity);
    const firstRise = requiredVerticalRise(platforms.g1!, platforms.p1!);
    expect(height).toBeCloseTo(150.89, 1);
    expect(height / firstRise).toBeGreaterThanOrEqual(1.15);
    expect(height / firstRise).toBeLessThanOrEqual(1.3);
  });

  it.each(approaches)('keeps pickup $pickup on a reachable route', ({ pickup, from, via, target }) => {
    const pickupPoint = sampleMap.pickups.find((item) => item.id === pickup)!;
    const takeoff = platforms[via ?? from]!;
    const landing = platforms[target]!;
    const height = calculateMaximumJumpHeight(gameplayConfig.player.jumpVelocity, gameplayConfig.player.gravity);
    expect(pickupPoint.x).toBeGreaterThanOrEqual(landing.x);
    expect(pickupPoint.x).toBeLessThanOrEqual(landing.x + landing.width);
    expect(requiredVerticalRise(takeoff, landing)).toBeLessThan(height);
    const travel = gameplayConfig.player.maxRunSpeed * descendingLandingTime(gameplayConfig.player.jumpVelocity, gameplayConfig.player.gravity, requiredVerticalRise(takeoff, landing));
    expect(travel).toBeGreaterThan(horizontalEdgeGap(takeoff, landing) + 20);
  });
});
