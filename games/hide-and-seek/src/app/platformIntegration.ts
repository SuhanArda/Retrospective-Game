import {
  consumeGameHandoff,
  resolveGameLaunchContext,
  type GameLaunchContext,
} from '@retro-platform/contracts';

export const HIDE_AND_SEEK_GAME_ID = 'hide-and-seek';

export interface HideAndSeekRuntimeConfig {
  platformUrl: string;
  apiUrl: string;
}

export function parseHideAndSeekRuntimeConfig(
  env: Record<string, string | boolean | undefined>,
): HideAndSeekRuntimeConfig {
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

export const hideAndSeekRuntimeConfig = parseHideAndSeekRuntimeConfig(import.meta.env);

export function resolveHideAndSeekLaunchContext(
  search: string,
  storage: Storage,
  windowLike?: { name: string },
): GameLaunchContext | null {
  const context = windowLike
    ? consumeGameHandoff(windowLike, storage) ?? resolveGameLaunchContext(search, storage)
    : resolveGameLaunchContext(search, storage);
  return context?.gameId === HIDE_AND_SEEK_GAME_ID ? context : null;
}

export function buildPlatformGameSelectionUrl(platformUrl: string, roomCode: string, origin: string): string {
  const url = new URL(platformUrl, origin);
  const basePath = url.pathname.replace(/\/$/, '');
  url.pathname = `${basePath}/room/${encodeURIComponent(roomCode)}/games`.replace(/\/{2,}/g, '/');
  url.search = '?returnFromGame=1';
  return url.toString();
}

/**
 * A picked pixel-art portrait lives on the *platform's* origin
 * (`apps/retro-platform-web/public/avatars/{id}.png`), never bundled into
 * this game — Saklambaç is deployed and navigated to as a separate origin
 * (see the launch-context flow above), so the id alone isn't a usable
 * `<img src>` on its own. No CORS header is needed for this: a plain
 * `<img>` (no `crossOrigin` attribute) loads and draws cross-origin fine,
 * it just can't have its pixels read back — which `HideSeekCanvas` never
 * does, it only ever `drawImage`s the portrait onto the map.
 */
export function buildAvatarUrl(platformUrl: string, avatarId: string): string {
  return `${platformUrl.replace(/\/+$/, '')}/avatars/${encodeURIComponent(avatarId)}.png`;
}
