export interface RuntimeConfig {
  apiBaseUrl?: string;
  hubUrl?: string;
  transportMode: 'mock' | 'signalr';
  platformUrl: string;
  roomApiUrl: string;
  aiBotUrl: string;
}

export function parseRuntimeConfig(env: Record<string, string | boolean | undefined>): RuntimeConfig {
  const requestedMode = env.VITE_TRANSPORT_MODE;
  return {
    transportMode: requestedMode === 'signalr' ? 'signalr' : 'mock',
    platformUrl: typeof env.VITE_PLATFORM_URL === 'string' && env.VITE_PLATFORM_URL ? env.VITE_PLATFORM_URL : 'http://localhost:5173',
    roomApiUrl: typeof env.VITE_API_URL === 'string' && env.VITE_API_URL ? env.VITE_API_URL : 'http://localhost:5281',
    aiBotUrl: typeof env.VITE_AI_BOT_URL === 'string' && env.VITE_AI_BOT_URL ? env.VITE_AI_BOT_URL : 'http://localhost:3002',
    ...(typeof env.VITE_API_BASE_URL === 'string' && env.VITE_API_BASE_URL ? { apiBaseUrl: env.VITE_API_BASE_URL } : {}),
    ...(typeof env.VITE_HUB_URL === 'string' && env.VITE_HUB_URL ? { hubUrl: env.VITE_HUB_URL } : {}),
  };
}

export function buildPlatformRoomUrl(platformUrl: string, roomCode: string, origin: string): string {
  const url = new URL(platformUrl, origin);
  const basePath = url.pathname.replace(/\/$/, '');
  url.pathname = `${basePath}/room/${roomCode}`.replace(/\/{2,}/g, '/');
  url.search = '';
  url.hash = '';
  return url.toString();
}

export function buildPlatformGameSelectionUrl(platformUrl: string, roomCode: string, origin: string): string {
  const url = new URL(platformUrl, origin);
  const basePath = url.pathname.replace(/\/$/, '');
  url.pathname = `${basePath}/room/${encodeURIComponent(roomCode)}/games`.replace(/\/{2,}/g, '/');
  url.search = '';
  url.searchParams.set('returnFromGame', '1');
  url.hash = '';
  return url.toString();
}

export const runtimeConfig = parseRuntimeConfig(import.meta.env);
