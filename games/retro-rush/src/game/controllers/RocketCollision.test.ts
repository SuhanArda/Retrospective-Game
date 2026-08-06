import { describe, expect, it } from 'vitest';
import { segmentIntersectsExpandedAabb } from './RocketCollision';

describe('swept rocket collision', () => {
  const player = { left: 100, right: 127, top: 80, bottom: 119 };

  it('detects a segment crossing the expanded player body', () => {
    expect(segmentIntersectsExpandedAabb({ x: 70, y: 70 }, { x: 140, y: 70 }, player, 12)).toBe(true);
  });

  it('does not report a segment outside the expanded body', () => {
    expect(segmentIntersectsExpandedAabb({ x: 70, y: 60 }, { x: 140, y: 60 }, player, 12)).toBe(false);
  });

  it('uses the configured expansion for near-edge hits', () => {
    expect(segmentIntersectsExpandedAabb({ x: 90, y: 70 }, { x: 140, y: 70 }, player, 9)).toBe(false);
    expect(segmentIntersectsExpandedAabb({ x: 90, y: 70 }, { x: 140, y: 70 }, player, 10)).toBe(true);
  });
});
