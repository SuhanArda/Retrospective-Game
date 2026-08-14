export const GAME_SESSION_STORAGE_KEY = 'retro-platform.game-session';
export const GAME_HANDOFF_WINDOW_NAME_PREFIX = 'retro-platform.handoff:';

export type RoomStatus = 'LOBBY' | 'GAME_SELECTION' | 'PLAYING' | 'CLOSED';

export interface RoomPlayerSnapshot {
  id: string;
  displayName: string;
  color: string;
  isHost: boolean;
  isReady: boolean;
  isConnected: boolean;
  joinedAt: number;
}

export interface GameSessionSnapshot {
  gameSessionId: string;
  gameId: string;
  roundId: string;
  seed: number;
  state: 'ACTIVE' | 'ENDED';
}

export type SpinBottleStateStatus =
  | 'IDLE'
  | 'SPINNING'
  | 'CHOICE'
  | 'CONFIRM'
  | 'LOADING'
  | 'QUESTION_ACTIVE'
  | 'RESOLVED';

export interface SpinBottleStateSnapshot {
  spinId: string;
  spinnerPlayerId: string;
  targetPlayerId: string;
  targetIndex: number;
  category?: 'İş' | 'Eğlence';
  questionId?: string;
  questionText?: string;
  status: SpinBottleStateStatus;
  revision: number;
  updatedAtUtc: number;
  stateEndsAtUtc?: number;
}

export type RussianRouletteStateStatus = 'IDLE' | 'QUESTION_ACTIVE';

/**
 * Which chamber holds the bullet is never part of this shape — the server
 * keeps that to itself so no client can read ahead of a shot. All this
 * carries is who holds the gun, what the last shot did, and (while a hit is
 * being answered) the question itself.
 */
export interface RussianRouletteStateSnapshot {
  holderPlayerId: string;
  status: RussianRouletteStateStatus;
  lastShooterPlayerId?: string;
  lastTargetPlayerId?: string;
  lastShotHit?: boolean;
  questionId?: string;
  questionText?: string;
  revision: number;
  updatedAtUtc: number;
}

export interface RoomSnapshot {
  id: string;
  code: string;
  roomName: string;
  hostPlayerId: string;
  players: RoomPlayerSnapshot[];
  selectedGameId?: string;
  status: RoomStatus;
  maxParticipants: number;
  questionTimeSeconds: number;
  votingTimeSeconds: number;
  fileName?: string;
  description?: string;
  createdAt: number;
  currentGameSession?: GameSessionSnapshot;
  spinBottleState?: SpinBottleStateSnapshot;
  russianRouletteState?: RussianRouletteStateSnapshot;
  /** Authoritative playerId -> gameId selections for the active room vote. */
  votes?: Record<string, string>;
  /** Unix milliseconds when the authoritative room vote opened. */
  votingStartedAt?: number;
  /** Unix milliseconds when the authoritative room vote closes. */
  votingEndsAt?: number;
  candidateGameIds?: string[];
  tieBreak?: { candidates: string[]; winner: string };
}

export interface RoomAdmission {
  roomCode: string;
  playerId: string;
  displayName: string;
  isHost: boolean;
  reconnectToken: string;
  room: RoomSnapshot;
  player: RoomPlayerSnapshot;
}

export interface SpinResult {
  spinId: string;
  gameSessionId: string;
  roundId: string;
  spinnerPlayerId: string;
  targetPlayerId: string;
  targetIndex: number;
  finalAngle: number;
  durationMs: number;
  createdAt: number;
}

export interface FireResult {
  gameSessionId: string;
  roundId: string;
  shooterPlayerId: string;
  targetPlayerId: string;
  hit: boolean;
  createdAt: number;
}

/** Only the person who was just shot may complete their own question. */
export function canCompleteFireQuestion(
  state: RussianRouletteStateSnapshot | null | undefined,
  playerId: string | null | undefined,
): boolean {
  return Boolean(state && playerId && state.lastTargetPlayerId === playerId);
}

export function canControlSpinQuestion(
  state: SpinBottleStateSnapshot | null | undefined,
  playerId: string | null | undefined,
): boolean {
  return Boolean(state && playerId && state.targetPlayerId === playerId);
}

export interface RoomReactionEvent {
  playerId: string;
  displayName: string;
  color: string;
  emoji: string;
  sentAt: number;
}

export interface GameLaunchContext {
  roomCode: string;
  playerId: string;
  displayName: string;
  gameId: string;
  isHost: boolean;
  gameSessionId: string;
  reconnectToken: string;
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
    typeof value.isHost === 'boolean' &&
    typeof value.gameSessionId === 'string' &&
    value.gameSessionId.length > 0 &&
    typeof value.reconnectToken === 'string' &&
    value.reconnectToken.length >= 32
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
    gameSessionId: params.get('gameSessionId') ?? '',
    reconnectToken: params.get('reconnectToken') ?? '',
  };
  return isGameLaunchContext(candidate) ? candidate : null;
}

export function createGameHandoff(context: GameLaunchContext): string {
  return `${GAME_HANDOFF_WINDOW_NAME_PREFIX}${JSON.stringify(context)}`;
}

export function consumeGameHandoff(windowLike: { name: string }, storage: Storage): GameLaunchContext | null {
  if (!windowLike.name.startsWith(GAME_HANDOFF_WINDOW_NAME_PREFIX)) return null;
  const raw = windowLike.name.slice(GAME_HANDOFF_WINDOW_NAME_PREFIX.length);
  // Clear before parsing so even a malformed envelope is one-time.
  windowLike.name = '';
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isGameLaunchContext(parsed)) return null;
    saveGameLaunchContext(storage, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export function resolveGameLaunchContext(search: string, storage: Storage): GameLaunchContext | null {
  const fromUrl = launchContextFromSearch(search);
  if (fromUrl) {
    saveGameLaunchContext(storage, fromUrl);
    return fromUrl;
  }
  return loadGameLaunchContext(storage);
}
