export interface RuntimeConfig { platformUrl: string; roomApiUrl: string }

export function parseRuntimeConfig(env: Record<string, string | boolean | undefined>): RuntimeConfig {
  const required = (name: string): string => {
    const value = env[name];
    if (typeof value === 'string' && value) return value;
    throw new Error(`Missing required build-time environment variable: ${name}`);
  };
  return { platformUrl: required('VITE_PLATFORM_URL'), roomApiUrl: required('VITE_API_URL') };
}

export function buildPlatformGameSelectionUrl(platformUrl: string, roomCode: string, origin: string): string {
  const url = new URL(platformUrl, origin);
  url.pathname = `${url.pathname.replace(/\/$/, '')}/room/${encodeURIComponent(roomCode)}/games`.replace(/\/{2,}/g, '/');
  url.search = '?returnFromGame=1';
  url.hash = '';
  return url.toString();
}

export const runtimeConfig = parseRuntimeConfig(import.meta.env);
