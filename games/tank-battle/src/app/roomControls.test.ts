import { describe, expect, it } from 'vitest';
import { canShowBackToGames } from './roomControls';

describe('Tank Battle room controls', () => {
  it('shows Back to Games only to an in-room host', () => {
    expect(canShowBackToGames(true, true)).toBe(true);
    expect(canShowBackToGames(true, false)).toBe(false);
    expect(canShowBackToGames(false, true)).toBe(false);
  });
});
