export interface GameRuntimeConfig {
  retroRushUrl: string;
  spinTheBottleUrl: string;
  rusRuletiUrl: string;
}

export function parseGameRuntimeConfig(
  env: Record<string, string | boolean | undefined>,
): GameRuntimeConfig {
  const requiredUrl = (name: string): string => {
    const value = env[name];
    if (typeof value === 'string' && value) return value;
    throw new Error(`Missing required build-time environment variable: ${name}`);
  };

  return {
    retroRushUrl: requiredUrl('VITE_RETRO_RUSH_URL'),
    spinTheBottleUrl: requiredUrl('VITE_SPIN_THE_BOTTLE_URL'),
    rusRuletiUrl: requiredUrl('VITE_RUS_RULETI_URL'),
  };
}

export const gameRuntimeConfig = parseGameRuntimeConfig(import.meta.env);
