import { describe, expect, it } from 'vitest';
import { buildGameSelectionUrl, parseImposterRuntimeConfig } from './platformIntegration';

describe('Imposter platform integration', () => {
  it('parses runtime URLs without touching shared configuration', () => {
    expect(parseImposterRuntimeConfig({ VITE_API_URL: 'https://api.example', VITE_PLATFORM_URL: '/retro' }))
      .toEqual({ apiUrl: 'https://api.example', platformUrl: '/retro' });
  });

  it('builds the return URL', () => {
    expect(buildGameSelectionUrl('/retro', 'ABC234', 'https://example.com').toString())
      .toBe('https://example.com/retro/room/ABC234/games?returnFromGame=1');
  });
});
