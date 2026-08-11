import { describe, expect, it, vi } from 'vitest';
import { loadGameLaunchContext, resolveGameLaunchContext } from '@retro-platform/contracts';
import { MemoryStorage } from '../testing/MemoryStorage';
import { buildGameLaunchUrl, GameLauncher, InvalidGameIdError } from './GameLauncher';

const context = {
  roomCode: 'ABC123',
  playerId: 'player-1',
  displayName: 'Arda Oner',
  gameId: 'retro-rush',
  isHost: true,
};

const config = {
  retroRushUrl: '/games/retro-rush/',
  spinTheBottleUrl: '/games/spin-the-bottle/',
};

describe('GameLauncher', () => {
  it('builds a Retro Rush URL containing the non-sensitive launch context', () => {
    const url = new URL(buildGameLaunchUrl('http://localhost:5174', context, 'http://localhost:5173'));
    expect(url.origin).toBe('http://localhost:5174');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      roomCode: 'ABC123',
      playerId: 'player-1',
      displayName: 'Arda Oner',
      gameId: 'retro-rush',
      isHost: 'true',
    });
  });

  it('stores the launch context and navigates through one launcher boundary', () => {
    const storage = new MemoryStorage();
    const navigate = vi.fn();
    const launcher = new GameLauncher(config, storage, 'https://example.test', navigate);
    launcher.launchGame(context);
    expect(loadGameLaunchContext(storage)).toEqual(context);
    expect(navigate).toHaveBeenCalledWith(expect.stringContaining('/games/retro-rush/?roomCode=ABC123'));
  });

  it('rejects invalid game IDs', () => {
    const launcher = new GameLauncher(config, new MemoryStorage(), 'https://example.test', vi.fn());
    expect(() => launcher.createLaunchUrl({ ...context, gameId: 'missing' })).toThrow(InvalidGameIdError);
  });

  it('lets Retro Rush generate and restore its launch context from navigation data', () => {
    const storage = new MemoryStorage();
    const search = `?${new URLSearchParams({ ...context, isHost: String(context.isHost) })}`;
    expect(resolveGameLaunchContext(search, storage)).toEqual(context);
    expect(resolveGameLaunchContext('', storage)).toEqual(context);
  });

  it('launches Spin the Bottle with the same room and player context', () => {
    const spinContext = { ...context, gameId: 'spin-the-bottle' };
    const storage = new MemoryStorage();
    const launcher = new GameLauncher(config, storage, 'https://example.test', vi.fn());
    const url = new URL(launcher.createLaunchUrl(spinContext));

    expect(url.pathname).toBe('/games/spin-the-bottle/');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      roomCode: 'ABC123',
      playerId: 'player-1',
      displayName: 'Arda Oner',
      gameId: 'spin-the-bottle',
      isHost: 'true',
    });
  });
});
