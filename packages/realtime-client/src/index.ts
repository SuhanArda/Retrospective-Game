import {
  HubConnection,
  HubConnectionBuilder,
  HubConnectionState,
  LogLevel,
} from '@microsoft/signalr';
import type {
  DrawAndGuessGuessResult,
  DrawAndGuessStateSnapshot,
  DrawAndGuessStrokeEvent,
  DrawAndGuessWordReveal,
  FireResult,
  GameLaunchContext,
  GameSessionSnapshot,
  ImposterGameSnapshot,
  ImposterStateChanged,
  CastImposterVoteRequest,
  RoomReactionEvent,
  RoomSnapshot,
  RussianRouletteStateSnapshot,
  SpinBottleStateSnapshot,
  SpinResult,
  CompleteRetroRushQuestionRequest,
  RequestRetroRushPlayerEliminationRequest,
  RequestRetroRushRocketFireRequest,
  RequestRetroRushRocketHitRequest,
  RequestRetroRushShoveRequest,
  RetroRushAbilityApplied,
  RetroRushGameSnapshot,
  RetroRushPlayerEliminated,
  RetroRushPlayerSnapshot,
  RetroRushRocketHitApplied,
  RetroRushRocketSnapshot,
  RetroRushShoveApplied,
  RetroRushShoveCommandResult,
  UpdateRetroRushPlayerRequest,
  UseRetroRushAbilityRequest,
} from '@retro-platform/contracts';

export { RoomQuestionProvider, parseRoomQuestionSet, questionForStableKey } from './roomQuestionProvider';

export interface RoomCredentials {
  roomCode: string;
  playerId: string;
  reconnectToken: string;
}

export interface RejoinResult {
  ok: boolean;
  room?: RoomSnapshot;
  error?: string;
}

type EventMap = {
  roomSnapshot: RoomSnapshot;
  roomClosed: undefined;
  gameStarted: GameSessionSnapshot;
  returnedToGameSelection: RoomSnapshot;
  spinResult: SpinResult;
  spinBottleStateChanged: SpinBottleStateSnapshot;
  fireResult: FireResult;
  russianRouletteStateChanged: RussianRouletteStateSnapshot;
  drawAndGuessStateChanged: DrawAndGuessStateSnapshot;
  drawAndGuessGuessSubmitted: DrawAndGuessGuessResult;
  drawAndGuessStrokeReceived: DrawAndGuessStrokeEvent;
  drawAndGuessCanvasCleared: undefined;
  drawAndGuessWordRevealed: DrawAndGuessWordReveal;
  reaction: RoomReactionEvent;
  connectionChanged: 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
  retroRushSnapshot: RetroRushGameSnapshot;
  retroRushPlayerUpdated: RetroRushPlayerSnapshot;
  retroRushShoveApplied: RetroRushShoveApplied;
  retroRushRocketSpawned: RetroRushRocketSnapshot;
  retroRushRocketHit: RetroRushRocketHitApplied;
  retroRushAbilityApplied: RetroRushAbilityApplied;
  retroRushPlayerEliminated: RetroRushPlayerEliminated;
  retroRushRoundStarted: RetroRushGameSnapshot;
  imposterStateChanged: ImposterStateChanged;
};

type Listener<K extends keyof EventMap> = (event: EventMap[K]) => void;

export class RoomRealtimeClient {
  private connection: HubConnection | null = null;
  private connecting: Promise<RoomSnapshot> | null = null;
  private disconnectRequested = false;
  private readonly listeners = new Map<keyof EventMap, Set<(event: never) => void>>();

  constructor(
    private readonly serverUrl: string,
    private readonly credentials: RoomCredentials,
  ) {}

  static fromLaunchContext(serverUrl: string, context: GameLaunchContext): RoomRealtimeClient {
    return new RoomRealtimeClient(serverUrl, context);
  }

  async connect(): Promise<RoomSnapshot> {
    this.disconnectRequested = false;
    if (this.connecting) return this.connecting;
    if (this.connection?.state === HubConnectionState.Connected) return this.rejoin();
    this.connecting = this.open().finally(() => { this.connecting = null; });
    return this.connecting;
  }

  async disconnect(): Promise<void> {
    this.disconnectRequested = true;
    const opening = this.connecting;
    if (opening) await opening.catch(() => undefined);
    const connection = this.connection;
    this.connection = null;
    if (connection) await connection.stop();
  }

  on<K extends keyof EventMap>(event: K, listener: Listener<K>): () => void {
    const listeners = this.listeners.get(event) ?? new Set<(event: never) => void>();
    listeners.add(listener as (event: never) => void);
    this.listeners.set(event, listeners);
    return () => listeners.delete(listener as (event: never) => void);
  }

  beginGameSelection(candidateGameIds: readonly string[]): Promise<RoomSnapshot> {
    return this.invoke('BeginGameSelection', candidateGameIds);
  }
  castVote(gameId: string): Promise<RoomSnapshot> { return this.invoke('CastVote', gameId); }
  resolveVote(): Promise<RoomSnapshot> { return this.invoke('ResolveVote'); }
  returnToGameSelection(): Promise<RoomSnapshot> { return this.invoke('ReturnToGameSelection'); }
  returnToLobby(): Promise<RoomSnapshot> { return this.invoke('ReturnToLobby'); }
  requestSpin(): Promise<SpinResult> { return this.invoke('RequestSpin'); }
  chooseSpinCategory(category: 'İş' | 'Eğlence', expectedRevision: number): Promise<RoomSnapshot> {
    return this.invoke('ChooseSpinCategory', category, expectedRevision);
  }
  resetSpinCategory(expectedRevision: number): Promise<RoomSnapshot> {
    return this.invoke('ResetSpinCategory', expectedRevision);
  }
  activateSpinQuestion(expectedRevision: number): Promise<RoomSnapshot> {
    return this.invoke('ActivateSpinQuestion', expectedRevision);
  }
  passSpinQuestion(questionId: string, expectedRevision: number): Promise<RoomSnapshot> {
    return this.invoke('PassSpinQuestion', questionId, expectedRevision);
  }
  completeSpinQuestion(questionId: string, expectedRevision: number): Promise<RoomSnapshot> {
    return this.invoke('CompleteSpinQuestion', questionId, expectedRevision);
  }
  requestFire(targetPlayerId: string): Promise<FireResult> { return this.invoke('RequestFire', targetPlayerId); }
  completeFireQuestion(expectedRevision: number): Promise<RoomSnapshot> {
    return this.invoke('CompleteFireQuestion', expectedRevision);
  }
  /** Resolves only for the caller — SignalR never broadcasts a method's return value. */
  requestDrawAndGuessWord(): Promise<string> { return this.invoke('RequestDrawAndGuessWord'); }
  submitDrawAndGuessGuess(text: string): Promise<DrawAndGuessGuessResult> {
    return this.invoke('SubmitDrawAndGuessGuess', text);
  }
  nextDrawAndGuessRound(): Promise<RoomSnapshot> { return this.invoke('NextDrawAndGuessRound'); }
  requestDrawAndGuessLetterHint(): Promise<RoomSnapshot> { return this.invoke('RequestDrawAndGuessLetterHint'); }
  sendDrawAndGuessStroke(points: readonly number[], newStroke: boolean, color: string, isEraser: boolean): Promise<void> {
    return this.invoke('SendDrawAndGuessStroke', points, newStroke, color, isEraser);
  }
  clearDrawAndGuessCanvas(): Promise<void> { return this.invoke('ClearDrawAndGuessCanvas'); }
  leaveRoom(): Promise<void> { return this.invoke('LeaveRoom'); }
  sendReaction(emoji: string): Promise<void> { return this.invoke('SendReaction', emoji); }
  getRetroRushSnapshot(gameSessionId: string): Promise<RetroRushGameSnapshot> {
    return this.invoke('GetRetroRushSnapshot', gameSessionId);
  }
  updateRetroRushPlayer(request: UpdateRetroRushPlayerRequest): Promise<void> {
    return this.invoke('UpdateRetroRushPlayer', request);
  }
  requestRetroRushShove(request: RequestRetroRushShoveRequest): Promise<RetroRushShoveCommandResult> {
    return this.invoke('RequestRetroRushShove', request);
  }
  requestRetroRushRocketFire(request: RequestRetroRushRocketFireRequest): Promise<void> {
    return this.invoke('RequestRetroRushRocketFire', request);
  }
  requestRetroRushRocketHit(request: RequestRetroRushRocketHitRequest): Promise<void> {
    return this.invoke('RequestRetroRushRocketHit', request);
  }
  requestRetroRushPlayerElimination(request: RequestRetroRushPlayerEliminationRequest): Promise<void> {
    return this.invoke('RequestRetroRushPlayerElimination', request);
  }
  completeRetroRushQuestion(request: CompleteRetroRushQuestionRequest): Promise<void> {
    return this.invoke('CompleteRetroRushQuestion', request);
  }
  useRetroRushAbility(request: UseRetroRushAbilityRequest): Promise<void> {
    return this.invoke('UseRetroRushAbility', request);
  }
  getImposterSnapshot(gameSessionId: string): Promise<ImposterGameSnapshot> {
    return this.invoke('GetImposterSnapshot', gameSessionId);
  }
  readyImposterRole(gameSessionId: string): Promise<ImposterGameSnapshot> {
    return this.invoke('ReadyImposterRole', gameSessionId);
  }
  completeImposterClue(gameSessionId: string): Promise<ImposterGameSnapshot> {
    return this.invoke('CompleteImposterClue', gameSessionId);
  }
  castImposterVote(request: CastImposterVoteRequest): Promise<ImposterGameSnapshot> {
    return this.invoke('CastImposterVote', request);
  }
  startNextImposterRound(gameSessionId: string): Promise<ImposterGameSnapshot> {
    return this.invoke('StartNextImposterRound', gameSessionId);
  }
  setImposterBackground(gameSessionId: string, backgroundId: string): Promise<ImposterGameSnapshot> {
    return this.invoke('SetImposterBackground', gameSessionId, backgroundId);
  }

  private async open(): Promise<RoomSnapshot> {
    this.emit('connectionChanged', 'connecting');
    const connection = new HubConnectionBuilder()
      .withUrl(`${this.serverUrl.replace(/\/$/, '')}/hubs/room`)
      .withAutomaticReconnect([0, 1000, 3000, 5000, 10000])
      .configureLogging(LogLevel.Warning)
      .build();
    connection.on('RoomSnapshot', (room: RoomSnapshot) => this.emit('roomSnapshot', room));
    connection.on('RoomClosed', () => this.emit('roomClosed', undefined));
    connection.on('GameStarted', (session: GameSessionSnapshot) => this.emit('gameStarted', session));
    connection.on('ReturnedToGameSelection', (room: RoomSnapshot) => this.emit('returnedToGameSelection', room));
    connection.on('SpinResult', (result: SpinResult) => this.emit('spinResult', result));
    connection.on('SpinBottleStateChanged', (state: SpinBottleStateSnapshot) => this.emit('spinBottleStateChanged', state));
    connection.on('FireResult', (result: FireResult) => this.emit('fireResult', result));
    connection.on('RussianRouletteStateChanged', (state: RussianRouletteStateSnapshot) => this.emit('russianRouletteStateChanged', state));
    connection.on('DrawAndGuessStateChanged', (state: DrawAndGuessStateSnapshot) => this.emit('drawAndGuessStateChanged', state));
    connection.on('DrawAndGuessGuessSubmitted', (result: DrawAndGuessGuessResult) => this.emit('drawAndGuessGuessSubmitted', result));
    connection.on('DrawAndGuessStrokeReceived', (stroke: DrawAndGuessStrokeEvent) => this.emit('drawAndGuessStrokeReceived', stroke));
    connection.on('DrawAndGuessCanvasCleared', () => this.emit('drawAndGuessCanvasCleared', undefined));
    connection.on('DrawAndGuessWordRevealed', (reveal: DrawAndGuessWordReveal) => this.emit('drawAndGuessWordRevealed', reveal));
    connection.on('ReactionReceived', (reaction: RoomReactionEvent) => this.emit('reaction', reaction));
    connection.on('RetroRushSnapshot', (snapshot: RetroRushGameSnapshot) => this.emit('retroRushSnapshot', snapshot));
    connection.on('RetroRushPlayerUpdated', (player: RetroRushPlayerSnapshot) => this.emit('retroRushPlayerUpdated', player));
    connection.on('RetroRushShoveApplied', (shove: RetroRushShoveApplied) => this.emit('retroRushShoveApplied', shove));
    connection.on('RetroRushRocketSpawned', (rocket: RetroRushRocketSnapshot) => this.emit('retroRushRocketSpawned', rocket));
    connection.on('RetroRushRocketHit', (hit: RetroRushRocketHitApplied) => this.emit('retroRushRocketHit', hit));
    connection.on('RetroRushAbilityApplied', (ability: RetroRushAbilityApplied) => this.emit('retroRushAbilityApplied', ability));
    connection.on('RetroRushPlayerEliminated', (elimination: RetroRushPlayerEliminated) => this.emit('retroRushPlayerEliminated', elimination));
    connection.on('RetroRushRoundStarted', (snapshot: RetroRushGameSnapshot) => this.emit('retroRushRoundStarted', snapshot));
    connection.on('ImposterStateChanged', (state: ImposterStateChanged) => this.emit('imposterStateChanged', state));
    connection.onreconnecting(() => this.emit('connectionChanged', 'reconnecting'));
    connection.onreconnected(() => {
      this.emit('connectionChanged', 'connected');
      void this.rejoin().catch(() => this.emit('connectionChanged', 'disconnected'));
    });
    connection.onclose(() => this.emit('connectionChanged', 'disconnected'));
    await connection.start();
    if (this.disconnectRequested) {
      await connection.stop();
      throw new Error('ROOM_CONNECTION_CANCELLED');
    }
    this.connection = connection;
    const room = await this.rejoin();
    if (this.disconnectRequested) {
      await connection.stop();
      this.connection = null;
      throw new Error('ROOM_CONNECTION_CANCELLED');
    }
    this.emit('connectionChanged', 'connected');
    return room;
  }

  private async rejoin(): Promise<RoomSnapshot> {
    const result = await this.invoke<RejoinResult>('RejoinRoom', this.credentials.roomCode,
      this.credentials.playerId, this.credentials.reconnectToken);
    if (!result.ok || !result.room) throw new Error(result.error ?? 'REJOIN_FAILED');
    this.emit('roomSnapshot', result.room);
    return result.room;
  }

  private async invoke<T>(method: string, ...args: unknown[]): Promise<T> {
    if (!this.connection || this.connection.state !== HubConnectionState.Connected)
      throw new Error('ROOM_CONNECTION_NOT_READY');
    return this.connection.invoke<T>(method, ...args);
  }

  private emit<K extends keyof EventMap>(event: K, value: EventMap[K]): void {
    this.listeners.get(event)?.forEach(listener => listener(value as never));
  }
}
