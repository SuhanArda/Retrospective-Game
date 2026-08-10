import { describe, expect, it } from 'vitest';
import { findGame, gameRegistry } from './gameRegistry';

describe('game registry', () => {
  it('registers Retro Rush as the only playable game so far', () => {
    const available = gameRegistry.filter((game) => game.status === 'available');
    expect(available.map((game) => game.id)).toEqual(['retro-rush']);
  });

  it('offers the upcoming games as placeholders that cannot be launched', () => {
    const comingSoon = gameRegistry.filter((game) => game.status === 'coming-soon');
    expect(comingSoon.map((game) => game.id)).toEqual(['pixel-arena', 'sprint-maze']);
    for (const game of comingSoon) {
      expect(() => game.getLaunchUrl({ retroRushUrl: 'http://localhost:5174' })).toThrow();
    }
  });

  it('returns null for unknown games', () => expect(findGame('not-a-game')).toBeNull());
});
