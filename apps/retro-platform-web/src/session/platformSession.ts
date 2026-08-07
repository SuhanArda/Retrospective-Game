export const PLATFORM_SESSION_STORAGE_KEY = 'retro-platform.session';

export interface PlatformSession {
  playerId: string;
  displayName: string;
  roomCode: string;
  isHost: boolean;
  selectedGameId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isPlatformSession(value: unknown): value is PlatformSession {
  if (!isRecord(value)) return false;
  return (
    typeof value.playerId === 'string' &&
    value.playerId.length > 0 &&
    typeof value.displayName === 'string' &&
    value.displayName.length > 0 &&
    typeof value.roomCode === 'string' &&
    /^[A-Z0-9]{6}$/.test(value.roomCode) &&
    typeof value.isHost === 'boolean' &&
    (value.selectedGameId === undefined || typeof value.selectedGameId === 'string')
  );
}

export function savePlatformSession(storage: Storage, session: PlatformSession): void {
  storage.setItem(PLATFORM_SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function loadPlatformSession(storage: Storage): PlatformSession | null {
  const raw = storage.getItem(PLATFORM_SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isPlatformSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearPlatformSession(storage: Storage): void {
  storage.removeItem(PLATFORM_SESSION_STORAGE_KEY);
}
