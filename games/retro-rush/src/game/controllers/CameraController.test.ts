import { describe, expect, it } from 'vitest';
import { calculateEliminationBoundary, calculateNextCameraX, findLeadingEligiblePlayer } from './CameraController';

describe('leader-following camera', () => {
  it('selects the furthest eligible player', () => {
    expect(findLeadingEligiblePlayer([
      { x: 900, state: 'FINISHED' }, { x: 700, state: 'RESPAWNING' }, { x: 800, state: 'ANSWERING_QUESTION' }, { x: 650, state: 'ACTIVE' },
    ])?.x).toBe(700);
  });

  it('moves smoothly forward, never backward, and respects catch-up and map bounds', () => {
    expect(calculateNextCameraX({ currentX: 200, deltaMs: 100, viewportWidth: 1000, worldWidth: 5000, players: [{ x: 2000, state: 'ACTIVE' }] })).toBe(290);
    expect(calculateNextCameraX({ currentX: 400, deltaMs: 16, viewportWidth: 1000, worldWidth: 5000, players: [{ x: 200, state: 'ACTIVE' }] })).toBe(400);
    expect(calculateNextCameraX({ currentX: 3990, deltaMs: 1000, viewportWidth: 1000, worldWidth: 5000, players: [{ x: 6000, state: 'ACTIVE' }] })).toBe(4000);
  });

  it('uses the same world-space boundary as the warning', () => {
    expect(calculateEliminationBoundary(250)).toBe(330);
  });
});
