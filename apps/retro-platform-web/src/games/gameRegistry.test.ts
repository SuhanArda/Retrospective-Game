import { describe, expect, it } from 'vitest';
import { findGame, gameRegistry } from './gameRegistry';

describe('game registry', () => {
  it('registers every playable game with a unique ID', () => {
    const available = gameRegistry.filter((game) => game.status === 'available');
    expect(available.map((game) => game.id)).toEqual(['retro-rush', 'spin-the-bottle', 'rus-ruleti', 'imposter']);
    expect(new Set(gameRegistry.map((game) => game.id)).size).toBe(gameRegistry.length);
    expect(findGame('retro-rush')?.name).toBe('Retro Rush');
    expect(findGame('spin-the-bottle')?.name).toBe('Spin the Bottle');
    expect(findGame('rus-ruleti')?.name).toBe('Rus Ruleti');
    expect(findGame('imposter')?.name).toBe('Imposter');
    expect(available.every((game) => game.screenshotUrl && game.voteScreenshotUrl)).toBe(true);
  });

  it('returns null for unknown games', () => expect(findGame('not-a-game')).toBeNull());
});
