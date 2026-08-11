import {
  resolveGameLaunchContext,
  type GameLaunchContext,
} from "@retro-platform/contracts";

export const SPIN_THE_BOTTLE_GAME_ID = "spin-the-bottle";

export interface SpinTheBottleRuntimeConfig {
  platformUrl: string;
}

export function parseSpinTheBottleRuntimeConfig(
  env: Record<string, string | boolean | undefined>,
): SpinTheBottleRuntimeConfig {
  return {
    platformUrl:
      typeof env.VITE_PLATFORM_URL === "string" && env.VITE_PLATFORM_URL
        ? env.VITE_PLATFORM_URL
        : "http://localhost:5173",
  };
}

export const spinTheBottleRuntimeConfig = parseSpinTheBottleRuntimeConfig(import.meta.env);

export function resolveSpinTheBottleLaunchContext(
  search: string,
  storage: Storage,
): GameLaunchContext | null {
  const context = resolveGameLaunchContext(search, storage);
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
