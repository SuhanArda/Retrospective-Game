import {
  consumeGameHandoff,
  resolveGameLaunchContext,
  type GameLaunchContext,
} from "@retro-platform/contracts";

export const SPIN_THE_BOTTLE_GAME_ID = "spin-the-bottle";

export interface SpinTheBottleRuntimeConfig {
  platformUrl: string;
  apiUrl: string;
  aiBotUrl: string;
}

export function parseSpinTheBottleRuntimeConfig(
  env: Record<string, string | boolean | undefined>,
): SpinTheBottleRuntimeConfig {
  return {
    platformUrl:
      typeof env.VITE_PLATFORM_URL === "string" && env.VITE_PLATFORM_URL
        ? env.VITE_PLATFORM_URL
        : "http://localhost:5173",
    apiUrl:
      typeof env.VITE_API_URL === "string" && env.VITE_API_URL
        ? env.VITE_API_URL
        : "http://localhost:5281",
    aiBotUrl:
      typeof env.VITE_AI_BOT_URL === "string" && env.VITE_AI_BOT_URL
        ? env.VITE_AI_BOT_URL
        : "http://localhost:3002",
  };
}

export const spinTheBottleRuntimeConfig = parseSpinTheBottleRuntimeConfig(import.meta.env);

export function resolveSpinTheBottleLaunchContext(
  search: string,
  storage: Storage,
  windowLike?: { name: string },
): GameLaunchContext | null {
  const context = windowLike
    ? consumeGameHandoff(windowLike, storage) ?? resolveGameLaunchContext(search, storage)
    : resolveGameLaunchContext(search, storage);
  return context?.gameId === SPIN_THE_BOTTLE_GAME_ID ? context : null;
}

export function buildPlatformGameSelectionUrl(
  platformUrl: string,
  roomCode: string,
  origin: string,
): string {
  const url = new URL(platformUrl, origin);
  const basePath = url.pathname.replace(/\/$/, "");
  url.pathname = `${basePath}/room/${encodeURIComponent(roomCode)}/games`.replace(/\/{2,}/g, "/");
  url.search = "?returnFromGame=1";
  return url.toString();
}
