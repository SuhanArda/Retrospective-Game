import { describe, expect, it } from 'vitest';
import { parseGameRuntimeConfig } from './runtimeConfig';

describe('game runtime configuration', () => {
  it('uses the development URL by default', () => {
    expect(parseGameRuntimeConfig({})).toEqual({ retroRushUrl: 'http://localhost:5174' });
  });

  it('supports a production path', () => {
    expect(parseGameRuntimeConfig({ VITE_RETRO_RUSH_URL: '/games/retro-rush/' })).toEqual({ retroRushUrl: '/games/retro-rush/' });
  });
});
