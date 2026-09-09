import { describe, expect, it } from 'vitest';
import { buildPlatformGameSelectionUrl } from './runtimeConfig';

describe('Tank Battle platform return URL', () => {
  it('returns to the same room game selection without launch credentials', () => {
    const result = new URL(buildPlatformGameSelectionUrl(
      'https://retro-platform.onrender.com',
      'ROOM 42',
      'https://tank-battle.example',
    ));

    expect(result.origin).toBe('https://retro-platform.onrender.com');
    expect(result.pathname).toBe('/room/ROOM%2042/games');
    expect([...result.searchParams]).toEqual([['returnFromGame', '1']]);
  });
});
