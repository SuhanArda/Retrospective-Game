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

export type RetroRushPhase = 'COUNTDOWN' | 'RUNNING' | 'QUESTION' | 'RESTARTING';
export type RetroRushMovementState =
  | 'ACTIVE'
  | 'FALLEN'
  | 'ANSWERING_QUESTION'
  | 'RESPAWNING'
  | 'INVULNERABLE'
  | 'FINISHED'
  | 'DISCONNECTED';
export type RetroRushAnimationState = 'idle' | 'running' | 'jumping' | 'falling' | 'hit' | 'eliminated';

export interface RetroRushPlayerSnapshot {
  playerId: string;
  displayName: string;
  color: string;
  slot: number;
  skinIndex: number;
  connected: boolean;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  facing: 'left' | 'right';
  movementState: RetroRushMovementState;
  animationState: RetroRushAnimationState;
  sequence: number;
  clientTimestamp: number;
  roundId: number;
  ownedAbilityIds: readonly AbilityId[];
}

export interface RetroRushQuestionSnapshot {
  questionId: string;
  ownerPlayerId: string;
  status: 'ACTIVE';
  roundId: number;
  category: string;
  type: 'text' | 'singleChoice' | 'rating';
  prompt: string;
  options?: readonly string[];
  required: boolean;
}

export interface RetroRushRocketSnapshot {
  rocketId: string;
  ownerPlayerId: string;
  targetPlayerId: string;
  x: number;
  y: number;
  spawnedAtUtc: number;
  roundId: number;
}

export interface RetroRushGameSnapshot {
  gameSessionId: string;
  roundId: number;
  mapSeed: number;
  phase: RetroRushPhase;
  phaseStartedAtUtc: number;
  roundStartsAtUtc: number;
  players: readonly RetroRushPlayerSnapshot[];
  collectedPickupIds: readonly string[];
  activeRockets: readonly RetroRushRocketSnapshot[];
  activeQuestion?: RetroRushQuestionSnapshot;
}

export interface UpdateRetroRushPlayerRequest {
  gameSessionId: string;
  playerId: string;
  roundId: number;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  facing: 'left' | 'right';
  movementState: RetroRushMovementState;
  animationState: RetroRushAnimationState;
  sequence: number;
  clientTimestamp: number;
}

export interface RequestRetroRushShoveRequest { gameSessionId: string; roundId: number; targetPlayerId: string; sequence: number }
export interface RetroRushShoveApplied { actionId: string; roundId: number; attackerPlayerId: string; targetPlayerId: string; velocityX: number; hitStunMs: number }
export type RetroRushShoveRejection = 'DUPLICATE_SHOVE' | 'SELF_SHOVE' | 'PLAYER_NOT_ACTIVE' | 'SHOVE_COOLDOWN' | 'SHOVE_OUT_OF_RANGE' | 'INVALID_SHOVE_TARGET' | 'STALE_ROUND' | 'WRONG_GAME_SESSION';
export interface RetroRushShoveCommandResult { accepted: boolean; rejection?: RetroRushShoveRejection }
export interface RequestRetroRushRocketFireRequest { gameSessionId: string; roundId: number }
export interface RequestRetroRushRocketHitRequest { gameSessionId: string; roundId: number; rocketId: string }
export interface RetroRushRocketHitApplied { rocketId: string; roundId: number; targetPlayerId: string; velocityX: number; hitStunMs: number }
export interface RequestRetroRushPickupCollectionRequest { gameSessionId: string; roundId: number; pickupId: string; abilityId: AbilityId }
export interface RetroRushPickupCollected { pickupId: string; roundId: number; playerId: string; abilityId: AbilityId }
export interface RequestRetroRushPlayerEliminationRequest { gameSessionId: string; roundId: number; playerId: string }
export interface RetroRushPlayerEliminated { roundId: number; playerId: string; question: RetroRushQuestionSnapshot }
export interface CompleteRetroRushQuestionRequest { gameSessionId: string; roundId: number; questionId: string }
export interface UseRetroRushAbilityRequest { gameSessionId: string; roundId: number; abilityId: AbilityId }
export interface RequestRetroRushAskTargetRequest { gameSessionId: string; roundId: number; targetPlayerId: string }
export interface RetroRushTargetQuestioned { roundId: number; sourcePlayerId: string; targetPlayerId: string }

export type AbilityId = 'speed' | 'rocket' | 'ask';

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
