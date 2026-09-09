import { consumeGameHandoff, resolveGameLaunchContext, type GameLaunchContext } from '@retro-platform/contracts';

export const WHEEL_OF_FORTUNE_GAME_ID = 'wheel-of-fortune';

function requiredUrl(name: string, value: string | undefined): string {
  if (value) return value;
  throw new Error(`Missing required build-time environment variable: ${name}`);
}

export const runtimeConfig = {
  platformUrl: requiredUrl('VITE_PLATFORM_URL', import.meta.env.VITE_PLATFORM_URL),
  apiUrl: requiredUrl('VITE_API_URL', import.meta.env.VITE_API_URL),
};

export function resolveLaunchContext(
  search: string,
  storage: Storage,
  windowLike: { name: string },
): GameLaunchContext | null {
  const context = consumeGameHandoff(windowLike, storage) ?? resolveGameLaunchContext(search, storage);
  return context?.gameId === WHEEL_OF_FORTUNE_GAME_ID ? context : null;
}

export function buildGameSelectionUrl(platformUrl: string, roomCode: string, origin: string): string {
  const url = new URL(platformUrl, origin);
  url.pathname = `${url.pathname.replace(/\/$/, '')}/room/${encodeURIComponent(roomCode)}/games`.replace(/\/{2,}/g, '/');
  url.search = '?returnFromGame=1';
  return url.toString();
}
