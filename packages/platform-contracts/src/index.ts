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
  roundStartAtUnixMs: number | null;
  state: 'ACTIVE' | 'ENDED';
}

export type ImposterPhase = 'ROLE_REVEAL' | 'CLUE_GIVING' | 'VOTING' | 'RESULTS';
export type ImposterRole = 'IMPOSTER' | 'CREW';

export interface ImposterPlayerSnapshot {
  playerId: string;
  displayName: string;
  avatarIndex: number;
  isConnected: boolean;
  hasRevealedRole: boolean;
  hasGivenClue: boolean;
  hasVoted: boolean;
}

export interface ImposterResultSnapshot {
  imposterPlayerId: string;
  suspectedPlayerIds: readonly string[];
  imposterCaught: boolean;
}

/**
 * This payload is returned to one authenticated participant at a time. The
 * server omits `secretWord` for the Imposter until results, so secret role
 * data must never be copied into the shared RoomSnapshot.
 */
export interface ImposterGameSnapshot {
  gameSessionId: string;
  roundNumber: number;
  revision: number;
  phase: ImposterPhase;
  backgroundId: string;
  players: readonly ImposterPlayerSnapshot[];
  currentSpeakerPlayerId?: string;
  yourRole: ImposterRole;
  secretWord?: string;
  wordCategory?: string;
  retroQuestion?: string;
  hasVoted: boolean;
  result?: ImposterResultSnapshot;
}

export interface ImposterStateChanged {
  gameSessionId: string;
  roundNumber: number;
  revision: number;
}

export interface CastImposterVoteRequest {
  gameSessionId: string;
  targetPlayerId: string;
}

export type RetroRushPhase = 'COUNTDOWN' | 'RUNNING' | 'RESULTS' | 'QUESTION' | 'RESTARTING';
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
  questionIndex?: number;
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

export interface RetroRushEliminationSnapshot {
  playerId: string;
  eliminatedAtUnixMs: number;
  order: number;
}

export interface RetroRushRankingEntry {
  playerId: string;
  displayName: string;
  color: string;
  place: number;
  progressX: number;
  eliminated: boolean;
  eliminatedAtUnixMs?: number;
}

export interface RetroRushGameSnapshot {
  gameSessionId: string;
  roundId: number;
  mapSeed: number;
  phase: RetroRushPhase;
  phaseStartedAtUtc: number;
  roundStartAtUnixMs: number;
  roundDeadlineAtUnixMs: number;
  resultsEndAtUnixMs: number;
  spawnX: number;
  spawnY: number;
  players: readonly RetroRushPlayerSnapshot[];
  collectedPickupIds: readonly string[];
  activeRockets: readonly RetroRushRocketSnapshot[];
  eliminationOrder: readonly RetroRushEliminationSnapshot[];
  ranking: readonly RetroRushRankingEntry[];
  lastPlacePlayerId?: string;
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
export type RetroRushShoveRejection = 'DUPLICATE_SHOVE' | 'SELF_SHOVE' | 'PLAYER_NOT_ACTIVE' | 'ROUND_NOT_STARTED' | 'SHOVE_COOLDOWN' | 'SHOVE_OUT_OF_RANGE' | 'INVALID_SHOVE_TARGET' | 'STALE_ROUND' | 'WRONG_GAME_SESSION';
export interface RetroRushShoveCommandResult { accepted: boolean; rejection?: RetroRushShoveRejection }
export interface RequestRetroRushRocketFireRequest { gameSessionId: string; roundId: number }
export interface RequestRetroRushRocketHitRequest { gameSessionId: string; roundId: number; rocketId: string }
export interface RetroRushRocketHitApplied { rocketId: string; roundId: number; targetPlayerId: string; velocityX: number; hitStunMs: number }
export interface RequestRetroRushPickupCollectionRequest { gameSessionId: string; roundId: number; pickupId: string; abilityId: AbilityId }
export interface RetroRushPickupCollected { pickupId: string; roundId: number; playerId: string; abilityId: AbilityId }
export interface RequestRetroRushPlayerEliminationRequest { gameSessionId: string; roundId: number; playerId: string }
export interface RetroRushPlayerEliminated { roundId: number; playerId: string; eliminatedAtUnixMs: number; order: number }
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

/**
 * The secret word is deliberately absent — the server hands it out only to
 * the current drawer, through a caller-only RPC reply, never through this
 * broadcast shape. Scores accumulate across the whole game, not just the
 * current round.
 */
export interface DrawAndGuessStateSnapshot {
  drawerPlayerId: string;
  roundNumber: number;
  correctGuesserIds: string[];
  scores: Record<string, number>;
  revision: number;
  updatedAtUtc: number;
  roundEndsAtUtc: number;
  wordLength: number;
  /** index → açılan harf. Sadece çizen açabilir, hepsi herkese aynı görünür. */
  revealedLetters: Record<number, string>;
  /** En son açılan harfin index'i — "Harf Ver"in az önce bir şey yaptığını vurgulamak için. */
  lastRevealedIndex?: number;
}

/** Süre dolunca (kimse ya da herkes bilemediyse) sohbete düşen kelime açıklaması. */
export interface DrawAndGuessWordReveal {
  word: string;
  revision: number;
}

/** A correct guess never carries the word — only who got it and in what order. */
export interface DrawAndGuessGuessResult {
  playerId: string;
  displayName: string;
  correct: boolean;
  rank?: number;
  text?: string;
  points?: number;
}

/** A drawing stroke point batch, relayed as-is — the server neither inspects nor stores it. */
export interface DrawAndGuessStrokeEvent {
  playerId: string;
  points: number[];
  newStroke: boolean;
  color: string;
  isEraser: boolean;
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
  drawAndGuessState?: DrawAndGuessStateSnapshot;
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

export interface GeneratedQuestion {
  id: string;
  text: string;
  answer: string;
  options?: string[];
  correctOptionIndex?: number;
  difficulty?: 'easy' | 'medium' | 'hard';
  category?: 'reflection' | 'teamwork' | 'improvement' | 'fun';
  gameCategory?: 'work' | 'entertainment';
}

export interface RoomQuestionSet {
  roomId: string;
  roomInstanceId: string;
  questionSetId: string;
  provider: 'demo' | 'gemini';
  generationStatus: 'idle' | 'generating' | 'ready' | 'failed';
  questions: GeneratedQuestion[];
  createdAt: number;
  updatedAt: number;
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
