import { describe, expect, it } from 'vitest';
import { buildPlatformRoomUrl, parseRuntimeConfig } from './runtimeConfig';

describe('runtime configuration', () => {
  it('defaults to mock mode and the local platform URL', () => expect(parseRuntimeConfig({})).toEqual({ transportMode: 'mock', platformUrl: 'http://localhost:5173' }));
  it('accepts explicitly configured SignalR and platform boundaries', () => expect(parseRuntimeConfig({ VITE_TRANSPORT_MODE: 'signalr', VITE_HUB_URL: 'https://example.test/hub', VITE_PLATFORM_URL: '/platform/' })).toEqual({ transportMode: 'signalr', hubUrl: 'https://example.test/hub', platformUrl: '/platform/' }));
  it('falls back safely for unknown modes', () => expect(parseRuntimeConfig({ VITE_TRANSPORT_MODE: 'other' })).toEqual({ transportMode: 'mock', platformUrl: 'http://localhost:5173' }));
  it('builds the configured lobby return URL', () => expect(buildPlatformRoomUrl('/platform/', 'ABC123', 'https://example.test')).toBe('https://example.test/platform/room/ABC123'));
});
