import { HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import type {
  CreateRoomRequest,
  CreateRoomResult,
  JoinRoomRequest,
  JoinRoomResult,
  JoinRoomErrorCode,
  RetroRoom,
  RoomPlayer,
} from '../domain/room';
import {
  clearPlatformSession,
  loadPlatformSession,
  savePlatformSession,
} from '../session/platformSession';
import { normalizeRoomCode } from '../utils/roomCode';
import type { RoomReaction } from '../domain/reactions';
import type { ReactionListener, RoomListener, RoomService } from './RoomService';

interface JoinRoomResponse {
  ok: boolean;
  room?: RetroRoom;
  player?: RoomPlayer;
  error?: string;
}

const JOIN_ERRORS: readonly string[] = [
  'ROOM_NOT_FOUND',
  'ROOM_FULL',
  'ROOM_ALREADY_STARTED',
  'INVALID_ROOM_CODE',
];

function toJoinError(code: string | undefined): JoinRoomErrorCode {
  return JOIN_ERRORS.includes(code ?? '') ? (code as JoinRoomErrorCode) : 'ROOM_NOT_FOUND';
}

/**
 * Talks to the real room API. The server is the authority: this class holds
 * only the latest snapshot it was pushed, and never decides anything itself.
 *
 * Reads are synchronous because the pages need a value during render, so the
 * last snapshot is cached here and refreshed by `RoomSnapshot` pushes.
 * {@link ensureRoom} is what pages await before trusting an empty cache.
 */
export class SignalRRoomService implements RoomService {
  private connection: HubConnection | null = null;
  private connecting: Promise<HubConnection> | null = null;
  private room: RetroRoom | null = null;
  private readonly listeners = new Map<string, Set<RoomListener>>();
  private readonly reactionListeners = new Map<string, Set<ReactionListener>>();

  constructor(
    private readonly hubUrl: string,
    private readonly sessionStorage: Storage,
  ) {}

  private async getConnection(): Promise<HubConnection> {
    if (this.connection?.state === HubConnectionState.Connected) return this.connection;
    // Concurrent callers share one handshake instead of racing to open sockets.
    this.connecting ??= this.openConnection().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  private async openConnection(): Promise<HubConnection> {
    const connection = new HubConnectionBuilder()
      .withUrl(this.hubUrl)
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Warning)
      .build();

    connection.on('RoomSnapshot', (room: RetroRoom) => this.publish(room));
    connection.on('RoomClosed', () => this.publish(null));
    connection.on('ReactionReceived', (reaction: RoomReaction) => this.publishReaction(reaction));

    // A reconnect gives us a new connection on the server, so the room has to
    // be told who came back — otherwise the grace period expires and the
    // player is dropped from a room they are still looking at.
    connection.onreconnected(() => void this.reattach());

    await connection.start();
    this.connection = connection;
    return connection;
  }

  private async reattach(): Promise<void> {
    const session = loadPlatformSession(this.sessionStorage);
    if (!session || !this.connection) return;
    try {
      const response: JoinRoomResponse = await this.connection.invoke(
        'RejoinRoom',
        session.roomCode,
        session.playerId,
      );
      if (response.ok && response.room) this.publish(response.room);
      else this.publish(null);
    } catch {
      this.publish(null);
    }
  }

  private publish(room: RetroRoom | null): void {
    this.room = room;
    const code = room?.code ?? loadPlatformSession(this.sessionStorage)?.roomCode;
    if (!code) return;
    this.listeners.get(code)?.forEach((listener) => listener(room));
  }

  /**
   * Reactions carry no room code — the server sends them only to the group the
   * connection is already in — so they go to whichever room this browser is
   * sitting in.
   */
  private publishReaction(reaction: RoomReaction): void {
    const code = this.room?.code ?? loadPlatformSession(this.sessionStorage)?.roomCode;
    if (!code) return;
    this.reactionListeners.get(code)?.forEach((listener) => listener(reaction));
  }

  async ensureRoom(roomCode: string): Promise<RetroRoom | null> {
    const code = normalizeRoomCode(roomCode);
    const connection = await this.getConnection();
    const session = loadPlatformSession(this.sessionStorage);

    // Already a member (e.g. after a reload): take our seat back rather than
    // joining again, which would create a second player for the same person.
    if (session?.roomCode === code) {
      const response: JoinRoomResponse = await connection.invoke('RejoinRoom', code, session.playerId);
      if (response.ok && response.room) {
        this.publish(response.room);
        return response.room;
      }
      clearPlatformSession(this.sessionStorage);
    }

    const room = await connection.invoke<RetroRoom | null>('GetRoom', code);
    this.publish(room);
    return room;
  }

  async createRoom(request: CreateRoomRequest): Promise<CreateRoomResult> {
    const connection = await this.getConnection();
    const result = await connection.invoke<CreateRoomResult>('CreateRoom', {
      displayName: request.displayName,
      color: request.color,
      roomName: request.roomName,
      maxParticipants: request.maxParticipants,
      questionTimeSeconds: request.questionTimeSeconds,
      votingTimeSeconds: request.votingTimeSeconds,
      fileName: request.fileName ?? null,
      description: request.description ?? null,
    });
    this.saveSession(result.room, result.player);
    this.publish(result.room);
    return result;
  }

  async joinRoom(request: JoinRoomRequest): Promise<JoinRoomResult> {
    const connection = await this.getConnection();
    const response: JoinRoomResponse = await connection.invoke(
      'JoinRoom',
      normalizeRoomCode(request.roomCode),
      request.displayName,
      request.color,
    );
    if (!response.ok || !response.room || !response.player) {
      return { ok: false, error: toJoinError(response.error) };
    }
    this.saveSession(response.room, response.player);
    this.publish(response.room);
    return { ok: true, room: response.room, player: response.player };
  }

  async leaveRoom(): Promise<void> {
    const connection = this.connection;
    clearPlatformSession(this.sessionStorage);
    this.room = null;
    if (connection?.state === HubConnectionState.Connected) {
      await connection.invoke('LeaveRoom');
    }
  }

  getRoom(roomCode: string): RetroRoom | null {
    return this.room?.code === normalizeRoomCode(roomCode) ? this.room : null;
  }

  getCurrentRoom(): RetroRoom | null {
    return this.room;
  }

  getCurrentPlayer(): RoomPlayer | null {
    const session = loadPlatformSession(this.sessionStorage);
    if (!session) return null;
    return this.room?.players.find((player) => player.id === session.playerId) ?? null;
  }

  beginGameSelection(candidateGameIds: readonly string[]): Promise<RetroRoom> {
    return this.mutate('BeginGameSelection', [...candidateGameIds]);
  }

  castVote(gameId: string): Promise<RetroRoom> {
    return this.mutate('CastVote', gameId);
  }

  resolveVote(candidateIds: readonly string[]): Promise<RetroRoom> {
    return this.mutate('ResolveVote', [...candidateIds]);
  }

  returnToLobby(): Promise<RetroRoom> {
    return this.mutate('ReturnToLobby');
  }

  subscribe(roomCode: string, listener: RoomListener): () => void {
    const code = normalizeRoomCode(roomCode);
    const existing = this.listeners.get(code) ?? new Set<RoomListener>();
    existing.add(listener);
    this.listeners.set(code, existing);
    return () => {
      existing.delete(listener);
      if (existing.size === 0) this.listeners.delete(code);
    };
  }

  async sendReaction(emoji: string): Promise<void> {
    try {
      const connection = await this.getConnection();
      await connection.invoke('SendReaction', emoji);
    } catch {
      // Deliberately swallowed. A dropped emoji is not worth an error in
      // anyone's face, and the alternative is an unhandled rejection every
      // time the socket blinks mid-spam.
    }
  }

  subscribeToReactions(roomCode: string, listener: ReactionListener): () => void {
    const code = normalizeRoomCode(roomCode);
    const existing = this.reactionListeners.get(code) ?? new Set<ReactionListener>();
    existing.add(listener);
    this.reactionListeners.set(code, existing);
    return () => {
      existing.delete(listener);
      if (existing.size === 0) this.reactionListeners.delete(code);
    };
  }

  private async mutate(method: string, ...args: unknown[]): Promise<RetroRoom> {
    const connection = await this.getConnection();
    const room = await connection.invoke<RetroRoom>(method, ...args);
    this.publish(room);
    return room;
  }

  private saveSession(room: RetroRoom, player: RoomPlayer): void {
    savePlatformSession(this.sessionStorage, {
      playerId: player.id,
      displayName: player.displayName,
      roomCode: room.code,
      isHost: player.isHost,
    });
  }
}
