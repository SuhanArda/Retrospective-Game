import { RoomRealtimeClient } from '@retro-platform/realtime-client';
import type { RoomAdmission } from '@retro-platform/contracts';
import type {
  CreateRoomRequest,
  CreateRoomResult,
  JoinRoomErrorCode,
  JoinRoomRequest,
  JoinRoomResult,
  RetroRoom,
  RoomPlayer,
} from '../domain/room';
import type { RoomReaction } from '../domain/reactions';
import { clearPlatformSession, loadPlatformSession, savePlatformSession } from '../session/platformSession';
import { normalizeRoomCode } from '../utils/roomCode';
import type { ReactionListener, RoomConnectionStatus, RoomListener, RoomService } from './RoomService';

const JOIN_ERRORS = new Set<JoinRoomErrorCode>([
  'ROOM_NOT_FOUND', 'ROOM_FULL', 'ROOM_ALREADY_STARTED', 'INVALID_ROOM_CODE',
]);

export class SignalRRoomService implements RoomService {
  private client: RoomRealtimeClient | null = null;
  private room: RetroRoom | null = null;
  private connectionStatus: RoomConnectionStatus = 'disconnected';
  private readonly listeners = new Map<string, Set<RoomListener>>();
  private readonly reactionListeners = new Map<string, Set<ReactionListener>>();

  constructor(private readonly apiUrl: string, private readonly sessionStorage: Storage) {}

  async createRoom(request: CreateRoomRequest): Promise<CreateRoomResult> {
    const admission = await this.post<RoomAdmission>('/api/rooms', request);
    await this.admit(admission);
    return { room: admission.room as RetroRoom, player: admission.player as RoomPlayer, reconnectToken: admission.reconnectToken };
  }

  async joinRoom(request: JoinRoomRequest): Promise<JoinRoomResult> {
    try {
      const admission = await this.post<RoomAdmission>(
        `/api/rooms/${normalizeRoomCode(request.roomCode)}/join`,
        { displayName: request.displayName, color: request.color },
      );
      await this.admit(admission);
      return { ok: true, room: admission.room as RetroRoom, player: admission.player as RoomPlayer, reconnectToken: admission.reconnectToken };
    } catch (error) {
      const code = error instanceof Error ? error.message as JoinRoomErrorCode : 'ROOM_NOT_FOUND';
      return { ok: false, error: JOIN_ERRORS.has(code) ? code : 'ROOM_NOT_FOUND' };
    }
  }

  async ensureRoom(roomCode: string): Promise<RetroRoom | null> {
    const code = normalizeRoomCode(roomCode);
    const session = loadPlatformSession(this.sessionStorage);
    if (session?.roomCode === code && session.reconnectToken) {
      try {
        await this.connect(session.roomCode, session.playerId, session.reconnectToken);
        return this.room;
      } catch {
        clearPlatformSession(this.sessionStorage);
      }
    }
    const response = await fetch(`${this.apiUrl}/api/rooms/${code}`);
    if (!response.ok) return null;
    this.publish(await response.json() as RetroRoom);
    return this.room;
  }

  async leaveRoom(): Promise<void> {
    const client = this.client;
    clearPlatformSession(this.sessionStorage);
    this.room = null;
    if (client) {
      try { await client.leaveRoom(); } finally { await client.disconnect(); }
    }
    this.client = null;
  }

  getRoom(roomCode: string): RetroRoom | null { return this.room?.code === normalizeRoomCode(roomCode) ? this.room : null; }
  getCurrentRoom(): RetroRoom | null { return this.room; }
  getCurrentPlayer(): RoomPlayer | null {
    const session = loadPlatformSession(this.sessionStorage);
    return session ? this.room?.players.find(player => player.id === session.playerId) ?? null : null;
  }
  getConnectionStatus(): RoomConnectionStatus { return this.connectionStatus; }

  beginGameSelection(candidateGameIds: readonly string[]): Promise<RetroRoom> {
    return this.requireClient().beginGameSelection(candidateGameIds) as Promise<RetroRoom>;
  }
  castVote(gameId: string): Promise<RetroRoom> {
    return this.requireClient().castVote(gameId) as Promise<RetroRoom>;
  }
  resolveVote(candidateIds: readonly string[]): Promise<RetroRoom> {
    void candidateIds;
    return this.requireClient().resolveVote() as Promise<RetroRoom>;
  }
  returnToLobby(): Promise<RetroRoom> { return this.requireClient().returnToLobby() as Promise<RetroRoom>; }

  subscribe(roomCode: string, listener: RoomListener): () => void {
    const code = normalizeRoomCode(roomCode);
    const listeners = this.listeners.get(code) ?? new Set<RoomListener>();
    listeners.add(listener);
    this.listeners.set(code, listeners);
    return () => { listeners.delete(listener); };
  }

  async sendReaction(emoji: string): Promise<void> {
    try { await this.requireClient().sendReaction(emoji); } catch { /* transient UI event */ }
  }

  subscribeToReactions(roomCode: string, listener: ReactionListener): () => void {
    const code = normalizeRoomCode(roomCode);
    const listeners = this.reactionListeners.get(code) ?? new Set<ReactionListener>();
    listeners.add(listener);
    this.reactionListeners.set(code, listeners);
    return () => { listeners.delete(listener); };
  }

  private async admit(admission: RoomAdmission): Promise<void> {
    savePlatformSession(this.sessionStorage, {
      playerId: admission.playerId,
      displayName: admission.displayName,
      roomCode: admission.roomCode,
      isHost: admission.isHost,
      reconnectToken: admission.reconnectToken,
    });
    this.publish(admission.room as RetroRoom);
    await this.connect(admission.roomCode, admission.playerId, admission.reconnectToken);
  }

  private async connect(roomCode: string, playerId: string, reconnectToken: string): Promise<void> {
    if (!this.client) {
      this.client = new RoomRealtimeClient(this.apiUrl, { roomCode, playerId, reconnectToken });
      this.client.on('roomSnapshot', room => this.publish(room as RetroRoom));
      this.client.on('roomClosed', () => this.publish(null));
      this.client.on('reaction', reaction => this.publishReaction(reaction as RoomReaction));
      this.client.on('connectionChanged', status => {
        this.connectionStatus = status;
        if (this.room) this.publish(this.room);
      });
    }
    await this.client.connect();
  }

  private publish(room: RetroRoom | null): void {
    this.room = room;
    const session = loadPlatformSession(this.sessionStorage);
    const code = room?.code ?? session?.roomCode;
    if (room && session) {
      const me = room.players.find(player => player.id === session.playerId);
      savePlatformSession(this.sessionStorage, {
        playerId: session.playerId,
        displayName: session.displayName,
        roomCode: session.roomCode,
        isHost: me?.isHost ?? false,
        reconnectToken: session.reconnectToken,
        ...(typeof room.selectedGameId === 'string' ? { selectedGameId: room.selectedGameId } : {}),
        ...(typeof room.currentGameSession?.gameSessionId === 'string'
          ? { gameSessionId: room.currentGameSession.gameSessionId }
          : {}),
      });
    }
    if (code) this.listeners.get(code)?.forEach(listener => listener(room));
  }

  private publishReaction(reaction: RoomReaction): void {
    const code = this.room?.code;
    if (code) this.reactionListeners.get(code)?.forEach(listener => listener(reaction));
  }

  private requireClient(): RoomRealtimeClient {
    if (!this.client) throw new Error('NO_ACTIVE_ROOM');
    return this.client;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.apiUrl}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!response.ok) {
      const problem = await response.json().catch(() => ({ code: 'REQUEST_FAILED' })) as { code?: string };
      throw new Error(problem.code ?? 'REQUEST_FAILED');
    }
    return response.json() as Promise<T>;
  }
}
