import { createGameHandoff, saveGameLaunchContext, type GameLaunchContext } from '@retro-platform/contracts';
import { findGame, type GameDefinition } from './gameRegistry';
import type { GameRuntimeConfig } from './runtimeConfig';

export class InvalidGameIdError extends Error {
  constructor(gameId: string) {
    super(`Unknown or unavailable game: ${gameId}`);
    this.name = 'InvalidGameIdError';
  }
}

export function buildGameLaunchUrl(baseUrl: string, context: GameLaunchContext, origin: string): string {
  const url = new URL(baseUrl, origin);
  url.searchParams.set('roomCode', context.roomCode);
  url.searchParams.set('gameId', context.gameId);
  url.searchParams.set('gameSessionId', context.gameSessionId);
  return url.toString();
}

export class GameLauncher {
  constructor(
    private readonly config: GameRuntimeConfig,
    private readonly storage: Storage,
    private readonly origin: string,
    private readonly navigate: (url: string) => void,
    private readonly lookupGame: (gameId: string) => GameDefinition | null = findGame,
    private readonly handoffTarget?: { name: string },
  ) {}

  createLaunchUrl(context: GameLaunchContext): string {
    const game = this.lookupGame(context.gameId);
    if (!game || game.status !== 'available') throw new InvalidGameIdError(context.gameId);
    return buildGameLaunchUrl(game.getLaunchUrl(this.config), context, this.origin);
  }

  launchGame(context: GameLaunchContext): void {
    const url = this.createLaunchUrl(context);
    saveGameLaunchContext(this.storage, context);
    if (!this.handoffTarget) throw new Error('GAME_HANDOFF_TARGET_REQUIRED');
    this.handoffTarget.name = createGameHandoff(context);
    this.navigate(url);
  }
}
