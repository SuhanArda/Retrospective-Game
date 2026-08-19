import { describe, expect, it } from 'vitest';
import { buildPlatformGameSelectionUrl, buildPlatformRoomUrl, parseRuntimeConfig } from './runtimeConfig';

describe('runtime configuration', () => {
  it('fails clearly when a required build-time URL is missing', () => expect(() => parseRuntimeConfig({})).toThrow('VITE_PLATFORM_URL'));
  it('accepts explicitly configured SignalR and platform boundaries', () => expect(parseRuntimeConfig({ VITE_TRANSPORT_MODE: 'signalr', VITE_HUB_URL: 'https://example.test/hub', VITE_PLATFORM_URL: '/platform/', VITE_API_URL: 'https://rooms.example.test' })).toEqual({ transportMode: 'signalr', hubUrl: 'https://example.test/hub', platformUrl: '/platform/', roomApiUrl: 'https://rooms.example.test' }));
  it('keeps AI access behind the room API boundary', () => expect(parseRuntimeConfig({ VITE_PLATFORM_URL: '/', VITE_API_URL: 'https://rooms.example.test' }).roomApiUrl).toBe('https://rooms.example.test'));
  it('falls back safely for unknown modes', () => expect(parseRuntimeConfig({ VITE_TRANSPORT_MODE: 'other', VITE_PLATFORM_URL: '/', VITE_API_URL: 'https://rooms.example.test' })).toEqual({ transportMode: 'mock', platformUrl: '/', roomApiUrl: 'https://rooms.example.test' }));
  it('builds the configured lobby return URL', () => expect(buildPlatformRoomUrl('/platform/', 'ABC123', 'https://example.test')).toBe('https://example.test/platform/room/ABC123'));
  it('builds the same-room game-selection return URL', () => expect(buildPlatformGameSelectionUrl('/platform/', 'ABC123', 'https://example.test')).toBe('https://example.test/platform/room/ABC123/games?returnFromGame=1'));
  it('never sends a platform-launched game back to the landing page', () => expect(new URL(buildPlatformGameSelectionUrl('https://platform.example/base', 'ZXCV12', 'https://game.example')).pathname).toBe('/base/room/ZXCV12/games'));
  it('works for standalone relative configuration without reading launch context', () => expect(() => buildPlatformGameSelectionUrl('/', 'DX-204', 'http://127.0.0.1:4173')).not.toThrow());
  it('does not clear or rewrite platform session data while building the return URL', () => {
    window.sessionStorage.setItem('retro-platform.session', '{"playerId":"player-1"}');
    buildPlatformGameSelectionUrl('/platform', 'ABC123', window.location.origin);
    expect(window.sessionStorage.getItem('retro-platform.session')).toBe('{"playerId":"player-1"}');
    window.sessionStorage.removeItem('retro-platform.session');
  });
});
