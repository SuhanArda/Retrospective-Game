import { describe, expect, it } from 'vitest';
import { MemoryStorage } from '../testing/MemoryStorage';
import { clearPlatformSession, loadPlatformSession, savePlatformSession } from './platformSession';

describe('platform session storage', () => {
  it('serializes and restores a typed session', () => {
    const storage = new MemoryStorage();
    const session = { playerId: 'p1', displayName: 'Arda', roomCode: 'ABC123', isHost: true };
    savePlatformSession(storage, session);
    expect(loadPlatformSession(storage)).toEqual(session);
  });

  it('rejects malformed data and can clear a session', () => {
    const storage = new MemoryStorage();
    storage.setItem('retro-platform.session', '{bad json');
    expect(loadPlatformSession(storage)).toBeNull();
    clearPlatformSession(storage);
    expect(storage.length).toBe(0);
  });
});
