import { describe, expect, it, vi } from 'vitest';
import { consumeGameHandoff, loadGameLaunchContext } from '@retro-platform/contracts';
import { MemoryStorage } from '../testing/MemoryStorage';
import { buildGameLaunchUrl, GameLauncher, InvalidGameIdError } from './GameLauncher';

const context = {
  roomCode: 'ABC123',
  playerId: 'player-1',
  displayName: 'Arda Oner',
  gameId: 'retro-rush',
  isHost: true,
  gameSessionId: 'session-1',
  reconnectToken: 'abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGH',
};

const config = {
  retroRushUrl: '/games/retro-rush/',
  spinTheBottleUrl: '/games/spin-the-bottle/',
  rusRuletiUrl: '/games/rus-ruleti/',
  drawAndGuessUrl: '/games/draw-and-guess/',
  imposterUrl: '/games/imposter/',
  tankBattleUrl: '/games/tank-battle/',
};

describe('GameLauncher', () => {
  it('builds a Retro Rush URL containing the non-sensitive launch context', () => {
    const url = new URL(buildGameLaunchUrl('http://localhost:5174', context, 'http://localhost:5173'));
    expect(url.origin).toBe('http://localhost:5174');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      roomCode: 'ABC123',
      gameId: 'retro-rush',
      gameSessionId: 'session-1',
    });
  });

  it('stores the launch context and navigates through one launcher boundary', () => {
    const storage = new MemoryStorage();
    const navigate = vi.fn();
    const handoffTarget = { name: '' };
    const launcher = new GameLauncher(config, storage, 'https://example.test', navigate, undefined, handoffTarget);
    launcher.launchGame(context);
    expect(loadGameLaunchContext(storage)).toEqual(context);
    expect(navigate).toHaveBeenCalledWith(expect.stringContaining('/games/retro-rush/?roomCode=ABC123'));
    const gameStorage = new MemoryStorage();
    expect(consumeGameHandoff(handoffTarget, gameStorage)).toEqual(context);
    expect(handoffTarget.name).toBe('');
  });

  it('rejects invalid game IDs', () => {
    const launcher = new GameLauncher(config, new MemoryStorage(), 'https://example.test', vi.fn());
    expect(() => launcher.createLaunchUrl({ ...context, gameId: 'missing' })).toThrow(InvalidGameIdError);
  });

  it('does not put credentials into navigation data', () => {
    const storage = new MemoryStorage();
    const url = new URL(buildGameLaunchUrl('http://localhost:5174', context, 'http://localhost:5173'));
    expect(url.search).not.toContain('reconnectToken');
    expect(url.search).not.toContain('playerId');
    expect(loadGameLaunchContext(storage)).toBeNull();
  });

  it('launches Spin the Bottle with the same room and player context', () => {
    const spinContext = { ...context, gameId: 'spin-the-bottle' };
    const storage = new MemoryStorage();
    const launcher = new GameLauncher(config, storage, 'https://example.test', vi.fn());
    const url = new URL(launcher.createLaunchUrl(spinContext));

    expect(url.pathname).toBe('/games/spin-the-bottle/');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      roomCode: 'ABC123',
      gameId: 'spin-the-bottle',
      gameSessionId: 'session-1',
    });
  });

  it('launches Imposter through its configured frontend URL', () => {
    const imposterContext = { ...context, gameId: 'imposter' };
    const launcher = new GameLauncher(config, new MemoryStorage(), 'https://example.test', vi.fn());
    const url = new URL(launcher.createLaunchUrl(imposterContext));

    expect(url.pathname).toBe('/games/imposter/');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      roomCode: 'ABC123',
      gameId: 'imposter',
      gameSessionId: 'session-1',
    });
  });

  it('launches Tank Battle through its configured frontend URL', () => {
    const tankContext = { ...context, gameId: 'tank-battle' };
    const launcher = new GameLauncher(config, new MemoryStorage(), 'https://example.test', vi.fn());
    const url = new URL(launcher.createLaunchUrl(tankContext));

    expect(url.pathname).toBe('/games/tank-battle/');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      roomCode: 'ABC123',
      gameId: 'tank-battle',
      gameSessionId: 'session-1',
    });
  });
});
