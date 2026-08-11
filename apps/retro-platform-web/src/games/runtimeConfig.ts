export interface GameRuntimeConfig {
  retroRushUrl: string;
  spinTheBottleUrl: string;
}

export function parseGameRuntimeConfig(
  env: Record<string, string | boolean | undefined>,
): GameRuntimeConfig {
  return {
    retroRushUrl:
      typeof env.VITE_RETRO_RUSH_URL === 'string' && env.VITE_RETRO_RUSH_URL
        ? env.VITE_RETRO_RUSH_URL
        : 'http://localhost:5174',
    spinTheBottleUrl:
      typeof env.VITE_SPIN_THE_BOTTLE_URL === 'string' && env.VITE_SPIN_THE_BOTTLE_URL
        ? env.VITE_SPIN_THE_BOTTLE_URL
        : 'http://localhost:5175',
  };
}

export const gameRuntimeConfig = parseGameRuntimeConfig(import.meta.env);
