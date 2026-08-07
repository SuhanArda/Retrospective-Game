export const GAME_SESSION_STORAGE_KEY = 'retro-platform.game-session';

export interface GameLaunchContext {
  roomCode: string;
  playerId: string;
  displayName: string;
  gameId: string;
  isHost: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isGameLaunchContext(value: unknown): value is GameLaunchContext {
  if (!isRecord(value)) return false;
  return (
    typeof value.roomCode === 'string' &&
    /^[A-Z0-9]{6}$/.test(value.roomCode) &&
    typeof value.playerId === 'string' &&
    value.playerId.length > 0 &&
    typeof value.displayName === 'string' &&
    value.displayName.length > 0 &&
    typeof value.gameId === 'string' &&
    value.gameId.length > 0 &&
    typeof value.isHost === 'boolean'
  );
}

export function saveGameLaunchContext(storage: Storage, context: GameLaunchContext): void {
  storage.setItem(GAME_SESSION_STORAGE_KEY, JSON.stringify(context));
}

export function loadGameLaunchContext(storage: Storage): GameLaunchContext | null {
  const raw = storage.getItem(GAME_SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isGameLaunchContext(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function launchContextFromSearch(search: string): GameLaunchContext | null {
  const params = new URLSearchParams(search);
  const candidate: GameLaunchContext = {
    roomCode: params.get('roomCode')?.trim().toUpperCase() ?? '',
    playerId: params.get('playerId') ?? '',
    displayName: params.get('displayName') ?? '',
    gameId: params.get('gameId') ?? '',
    isHost: params.get('isHost') === 'true',
  };
  return isGameLaunchContext(candidate) ? candidate : null;
}

export function resolveGameLaunchContext(search: string, storage: Storage): GameLaunchContext | null {
  const fromUrl = launchContextFromSearch(search);
  if (fromUrl) {
    saveGameLaunchContext(storage, fromUrl);
    return fromUrl;
  }
  return loadGameLaunchContext(storage);
}
