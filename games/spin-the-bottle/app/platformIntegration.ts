import {
  consumeGameHandoff,
  resolveGameLaunchContext,
  type GameLaunchContext,
} from "@retro-platform/contracts";

export const SPIN_THE_BOTTLE_GAME_ID = "spin-the-bottle";

export interface SpinTheBottleRuntimeConfig {
  platformUrl: string;
  apiUrl: string;
  aiBotUrl: string | null;
}

export function parseSpinTheBottleRuntimeConfig(
  env: Record<string, string | boolean | undefined>,
): SpinTheBottleRuntimeConfig {
  const requiredUrl = (name: string): string => {
    const value = env[name];
    if (typeof value === "string" && value) return value;
    throw new Error(`Missing required build-time environment variable: ${name}`);
  };

  return {
    platformUrl: requiredUrl("VITE_PLATFORM_URL"),
    apiUrl: requiredUrl("VITE_API_URL"),
    aiBotUrl: typeof env.VITE_AI_BOT_URL === "string" && env.VITE_AI_BOT_URL ? env.VITE_AI_BOT_URL : null,
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
