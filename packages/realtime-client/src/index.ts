import {
  HubConnection,
  HubConnectionBuilder,
  HubConnectionState,
  LogLevel,
} from '@microsoft/signalr';
import type {
  GameLaunchContext,
  GameSessionSnapshot,
  RoomReactionEvent,
  RoomSnapshot,
  SpinBottleStateSnapshot,
  SpinResult,
} from '@retro-platform/contracts';

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
  reaction: RoomReactionEvent;
  connectionChanged: 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
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
  leaveRoom(): Promise<void> { return this.invoke('LeaveRoom'); }
  sendReaction(emoji: string): Promise<void> { return this.invoke('SendReaction', emoji); }

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
    connection.on('ReactionReceived', (reaction: RoomReactionEvent) => this.emit('reaction', reaction));
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
