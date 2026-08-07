import { describe, expect, it } from 'vitest';
import { findGame, gameRegistry } from './gameRegistry';

describe('game registry', () => {
  it('registers Retro Rush as the only available game', () => {
    expect(gameRegistry.map((game) => game.id)).toEqual(['retro-rush']);
    expect(findGame('retro-rush')?.status).toBe('available');
  });

  it('returns null for unknown games', () => expect(findGame('not-a-game')).toBeNull());
});
