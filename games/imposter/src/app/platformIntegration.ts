import {
  consumeGameHandoff,
  resolveGameLaunchContext,
  type GameLaunchContext,
} from '@retro-platform/contracts';

export const IMPOSTER_GAME_ID = 'imposter';

export interface ImposterRuntimeConfig {
  apiUrl: string;
  platformUrl: string;
}

export function parseImposterRuntimeConfig(
  env: Record<string, string | boolean | undefined>,
): ImposterRuntimeConfig {
  return {
    apiUrl: typeof env.VITE_API_URL === 'string' && env.VITE_API_URL
      ? env.VITE_API_URL
      : 'http://localhost:5281',
    platformUrl: typeof env.VITE_PLATFORM_URL === 'string' && env.VITE_PLATFORM_URL
      ? env.VITE_PLATFORM_URL
      : 'http://localhost:5173',
  };
}

export const imposterRuntimeConfig = parseImposterRuntimeConfig(import.meta.env);

export function resolveImposterLaunchContext(
  search: string,
  storage: Storage,
  windowLike?: { name: string },
): GameLaunchContext | null {
  const context = windowLike
    ? consumeGameHandoff(windowLike, storage) ?? resolveGameLaunchContext(search, storage)
    : resolveGameLaunchContext(search, storage);
  return context?.gameId === IMPOSTER_GAME_ID ? context : null;
}

export function buildGameSelectionUrl(platformUrl: string, roomCode: string, origin: string): string {
  const url = new URL(platformUrl, origin);
  const basePath = url.pathname.replace(/\/$/, '');
  url.pathname = `${basePath}/room/${encodeURIComponent(roomCode)}/games`.replace(/\/{2,}/g, '/');
  url.search = '?returnFromGame=1';
  return url.toString();
}
