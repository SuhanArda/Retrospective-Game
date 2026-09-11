import { describe, expect, it } from 'vitest';
import { roomLaunchMissingCredentials, shouldShowStandaloneStart } from './startupMode';

describe('Retro Rush startup mode', () => {
  it('never exposes the legacy start card during online initialization', () => {
    expect(shouldShowStandaloneStart(true, 'LOADING')).toBe(false);
    expect(shouldShowStandaloneStart(true, 'WAITING')).toBe(false);
    expect(shouldShowStandaloneStart(true, 'COUNTDOWN')).toBe(false);
  });

  it('preserves the intentional standalone start card', () => {
    expect(shouldShowStandaloneStart(false, 'WAITING')).toBe(true);
    expect(shouldShowStandaloneStart(false, 'RUNNING')).toBe(false);
  });

  it('sends a room launch that lost its credential envelope back to the lobby', () => {
    expect(roomLaunchMissingCredentials(false, '?roomCode=abc123&gameId=retro-rush')).toBe('ABC123');
  });

  it('leaves a healthy room launch and a deliberate standalone visit alone', () => {
    expect(roomLaunchMissingCredentials(true, '?roomCode=ABC123')).toBeNull();
    expect(roomLaunchMissingCredentials(false, '')).toBeNull();
    expect(roomLaunchMissingCredentials(false, '?roomCode=DX-204')).toBeNull();
  });
});
