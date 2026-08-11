import { describe, expect, it } from 'vitest';
import { findGame, gameRegistry } from './gameRegistry';

describe('game registry', () => {
  it('registers Retro Rush and Spin the Bottle as uniquely identified playable games', () => {
    const available = gameRegistry.filter((game) => game.status === 'available');
    expect(available.map((game) => game.id)).toEqual(['retro-rush', 'spin-the-bottle']);
    expect(new Set(gameRegistry.map((game) => game.id)).size).toBe(gameRegistry.length);
    expect(findGame('retro-rush')?.name).toBe('Retro Rush');
    expect(findGame('spin-the-bottle')?.name).toBe('Spin the Bottle');
  });

  it('offers the upcoming games as placeholders that cannot be launched', () => {
    const comingSoon = gameRegistry.filter((game) => game.status === 'coming-soon');
    expect(comingSoon.map((game) => game.id)).toEqual(['pixel-arena', 'sprint-maze']);
    for (const game of comingSoon) {
      expect(() => game.getLaunchUrl({
        retroRushUrl: 'http://localhost:5174',
        spinTheBottleUrl: 'http://localhost:5175',
      })).toThrow();
    }
  });

  it('returns null for unknown games', () => expect(findGame('not-a-game')).toBeNull());
});
