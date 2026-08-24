import { describe, expect, it } from 'vitest';
import { parseGameRuntimeConfig } from './runtimeConfig';

describe('game runtime configuration', () => {
  it('fails clearly when a required build-time URL is missing', () => {
    expect(() => parseGameRuntimeConfig({})).toThrow('VITE_RETRO_RUSH_URL');
  });

  it('supports a production path', () => {
    expect(parseGameRuntimeConfig({
      VITE_RETRO_RUSH_URL: '/games/retro-rush/',
      VITE_SPIN_THE_BOTTLE_URL: '/games/spin-the-bottle/',
      VITE_RUS_RULETI_URL: '/games/rus-ruleti/',
      VITE_DRAW_AND_GUESS_URL: '/games/draw-and-guess/',
      VITE_IMPOSTER_URL: '/games/imposter/',
    })).toEqual({
      retroRushUrl: '/games/retro-rush/',
      spinTheBottleUrl: '/games/spin-the-bottle/',
      rusRuletiUrl: '/games/rus-ruleti/',
      drawAndGuessUrl: '/games/draw-and-guess/',
      imposterUrl: '/games/imposter/',
    });
  });
});
