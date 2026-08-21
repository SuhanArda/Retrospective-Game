import {
  consumeGameHandoff,
  resolveGameLaunchContext,
  type GameLaunchContext,
} from '@retro-platform/contracts';

export const DRAW_AND_GUESS_GAME_ID = 'draw-and-guess';

export interface DrawAndGuessRuntimeConfig {
  platformUrl: string;
  apiUrl: string;
}

export function parseDrawAndGuessRuntimeConfig(
  env: Record<string, string | boolean | undefined>,
): DrawAndGuessRuntimeConfig {
  return {
    platformUrl:
      typeof env.VITE_PLATFORM_URL === 'string' && env.VITE_PLATFORM_URL
        ? env.VITE_PLATFORM_URL
        : 'http://localhost:5173',
    apiUrl:
      typeof env.VITE_API_URL === 'string' && env.VITE_API_URL
        ? env.VITE_API_URL
        : 'http://localhost:5281',
  };
}

export const drawAndGuessRuntimeConfig = parseDrawAndGuessRuntimeConfig(import.meta.env);

export function resolveDrawAndGuessLaunchContext(
  search: string,
  storage: Storage,
  windowLike?: { name: string },
): GameLaunchContext | null {
  const context = windowLike
    ? consumeGameHandoff(windowLike, storage) ?? resolveGameLaunchContext(search, storage)
    : resolveGameLaunchContext(search, storage);
  return context?.gameId === DRAW_AND_GUESS_GAME_ID ? context : null;
}

export function buildPlatformGameSelectionUrl(platformUrl: string, roomCode: string, origin: string): string {
  const url = new URL(platformUrl, origin);
  const basePath = url.pathname.replace(/\/$/, '');
  url.pathname = `${basePath}/room/${encodeURIComponent(roomCode)}/games`.replace(/\/{2,}/g, '/');
  url.search = '?returnFromGame=1';
  return url.toString();
}
