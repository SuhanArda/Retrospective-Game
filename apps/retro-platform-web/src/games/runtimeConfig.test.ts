import { describe, expect, it } from 'vitest';
import { parseGameRuntimeConfig } from './runtimeConfig';

describe('game runtime configuration', () => {
  it('uses the development URL by default', () => {
    expect(parseGameRuntimeConfig({})).toEqual({
      retroRushUrl: 'http://localhost:5174',
      spinTheBottleUrl: 'http://localhost:5175',
      rusRuletiUrl: 'http://localhost:5176',
    });
  });

  it('supports a production path', () => {
    expect(parseGameRuntimeConfig({
      VITE_RETRO_RUSH_URL: '/games/retro-rush/',
      VITE_SPIN_THE_BOTTLE_URL: '/games/spin-the-bottle/',
      VITE_RUS_RULETI_URL: '/games/rus-ruleti/',
    })).toEqual({
      retroRushUrl: '/games/retro-rush/',
      spinTheBottleUrl: '/games/spin-the-bottle/',
      rusRuletiUrl: '/games/rus-ruleti/',
    });
  });
});
