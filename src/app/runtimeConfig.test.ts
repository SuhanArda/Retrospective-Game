import { describe, expect, it } from 'vitest';
import { parseRuntimeConfig } from './runtimeConfig';

describe('runtime configuration', () => {
  it('defaults to mock mode without backend URLs', () => expect(parseRuntimeConfig({})).toEqual({ transportMode: 'mock' }));
  it('accepts an explicitly configured SignalR boundary', () => expect(parseRuntimeConfig({ VITE_TRANSPORT_MODE: 'signalr', VITE_HUB_URL: 'https://example.test/hub' })).toEqual({ transportMode: 'signalr', hubUrl: 'https://example.test/hub' }));
  it('falls back safely for unknown modes', () => expect(parseRuntimeConfig({ VITE_TRANSPORT_MODE: 'other' })).toEqual({ transportMode: 'mock' }));
});
