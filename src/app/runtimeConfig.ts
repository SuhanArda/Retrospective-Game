export interface RuntimeConfig {
  apiBaseUrl?: string;
  hubUrl?: string;
  transportMode: 'mock' | 'signalr';
}

export function parseRuntimeConfig(env: Record<string, string | boolean | undefined>): RuntimeConfig {
  const requestedMode = env.VITE_TRANSPORT_MODE;
  return {
    transportMode: requestedMode === 'signalr' ? 'signalr' : 'mock',
    ...(typeof env.VITE_API_BASE_URL === 'string' && env.VITE_API_BASE_URL ? { apiBaseUrl: env.VITE_API_BASE_URL } : {}),
    ...(typeof env.VITE_HUB_URL === 'string' && env.VITE_HUB_URL ? { hubUrl: env.VITE_HUB_URL } : {}),
  };
}

export const runtimeConfig = parseRuntimeConfig(import.meta.env);
