import type {
  CreateRoomRequest,
  CreateRoomResult,
  JoinRoomRequest,
  JoinRoomResult,
  RetroRoom,
  RoomPlayer,
} from '../domain/room';
import {
  clearPlatformSession,
  loadPlatformSession,
  savePlatformSession,
  type PlatformSession,
} from '../session/platformSession';
import { resolveVoteOutcome } from '../domain/voting';
import type { RoomReaction } from '../domain/reactions';
import { generateRoomCode, isValidRoomCode, normalizeRoomCode } from '../utils/roomCode';
import { RoomServiceError, type ReactionListener, type RoomListener, type RoomService } from './RoomService';

const ROOM_STORAGE_PREFIX = 'retro-platform.mock-room.';
const CHANNEL_NAME = 'retro-platform.mock-room-updates';

/**
 * Room snapshots and reactions share one channel, told apart by `kind`. A
 * second BroadcastChannel would have been simpler to write and wrong to run:
 * two instances of the same channel name in one tab hear each other, so the
 * two kinds of message would cross.
 */
type ChannelMessage =
  | { kind: 'room'; roomCode: string; room: RetroRoom | null }
  | { kind: 'reaction'; roomCode: string; reaction: RoomReaction };

interface MessageChannel {
  postMessage(message: ChannelMessage): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<ChannelMessage>) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent<ChannelMessage>) => void): void;
}

type IdFactory = () => string;
type RoomCodeFactory = () => string;

function defaultIdFactory(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function defaultChannelFactory(): MessageChannel | null {
  return typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL_NAME);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isRoomPlayer(value: unknown): value is RoomPlayer {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.displayName === 'string' &&
    typeof value.color === 'string' &&
    typeof value.isHost === 'boolean' &&
    typeof value.isReady === 'boolean'
  );
}

function isRetroRoom(value: unknown): value is RetroRoom {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.code === 'string' &&
    typeof value.roomName === 'string' &&
    typeof value.hostPlayerId === 'string' &&
    Array.isArray(value.players) &&
    value.players.every(isRoomPlayer) &&
    ['LOBBY', 'GAME_SELECTION', 'PLAYING', 'FINISHED'].includes(String(value.status)) &&
    typeof value.maxParticipants === 'number' &&
    typeof value.questionTimeSeconds === 'number' &&
    typeof value.votingTimeSeconds === 'number' &&
    typeof value.createdAt === 'number'
  );
}

/**
 * Frontend-only room authority. Snapshots are stored in this browser's
 * localStorage and updates are shared with same-origin tabs via BroadcastChannel.
 * It deliberately does not claim to synchronize other browsers or computers.
 */
export class MockRoomService implements RoomService {
  private readonly channel: MessageChannel | null;
  private readonly reactionListeners = new Map<string, Set<ReactionListener>>();

  constructor(
    private readonly roomStorage: Storage,
    private readonly sessionStorage: Storage,
    private readonly createId: IdFactory = defaultIdFactory,
    private readonly createCode: RoomCodeFactory = generateRoomCode,
    channelFactory: () => MessageChannel | null = defaultChannelFactory,
    private readonly now: () => number = Date.now,
    private readonly random: () => number = Math.random,
  ) {
    this.channel = channelFactory();
  }

  async createRoom(request: CreateRoomRequest): Promise<CreateRoomResult> {
    const code = this.createCode();
    const player: RoomPlayer = {
      id: this.createId(),
      displayName: request.displayName.trim(),
      color: request.color,
      ...(request.avatarId ? { avatarId: request.avatarId } : {}),
      isHost: true,
      isReady: true,
    };
    const room: RetroRoom = {
      id: this.createId(),
      code,
      roomName: request.roomName.trim(),
      hostPlayerId: player.id,
      players: [player],
      status: 'LOBBY',
      maxParticipants: request.maxParticipants,
      questionTimeSeconds: request.questionTimeSeconds,
      votingTimeSeconds: request.votingTimeSeconds,
      ...(request.fileName ? { fileName: request.fileName } : {}),
      ...(request.description ? { description: request.description.trim() } : {}),
      createdAt: Date.now(),
    };
    this.writeRoom(room);
    this.saveSession(room, player);
    return { room, player };
  }

  async joinRoom(request: JoinRoomRequest): Promise<JoinRoomResult> {
    const roomCode = normalizeRoomCode(request.roomCode);
    if (!isValidRoomCode(roomCode)) return { ok: false, error: 'INVALID_ROOM_CODE' };
    const room = this.readRoom(roomCode);
    if (!room) return { ok: false, error: 'ROOM_NOT_FOUND' };
    if (room.status === 'PLAYING' || room.status === 'FINISHED') {
      return { ok: false, error: 'ROOM_ALREADY_STARTED' };
    }
    if (room.players.length >= room.maxParticipants) return { ok: false, error: 'ROOM_FULL' };

    const player: RoomPlayer = {
      id: this.createId(),
      displayName: request.displayName.trim(),
      color: request.color,
      ...(request.avatarId ? { avatarId: request.avatarId } : {}),
      isHost: false,
      isReady: false,
    };
    const next = { ...room, players: [...room.players, player] };
    this.writeRoom(next);
    this.saveSession(next, player);
    return { ok: true, room: next, player };
  }

  async leaveRoom(): Promise<void> {
    const session = loadPlatformSession(this.sessionStorage);
    if (!session) return;
    const room = this.readRoom(session.roomCode);
    if (room) {
      const players = room.players.filter((player) => player.id !== session.playerId);
      if (players.length === 0) this.deleteRoom(room.code);
      else {
        const hostPlayerId = room.hostPlayerId === session.playerId ? players[0].id : room.hostPlayerId;
        const nextPlayers = players.map((player) => ({
          ...player,
          isHost: player.id === hostPlayerId,
        }));
        this.writeRoom({ ...room, hostPlayerId, players: nextPlayers });
      }
    }
    clearPlatformSession(this.sessionStorage);
  }

  getCurrentRoom(): RetroRoom | null {
    const session = loadPlatformSession(this.sessionStorage);
    return session ? this.getRoom(session.roomCode) : null;
  }

  getRoom(roomCode: string): RetroRoom | null {
    const code = normalizeRoomCode(roomCode);
    const session = loadPlatformSession(this.sessionStorage);
    if (session?.roomCode !== code) return null;
    const room = this.readRoom(code);
    return room?.players.some((player) => player.id === session.playerId) ? room : null;
  }

  private readRoom(roomCode: string): RetroRoom | null {
    const raw = this.roomStorage.getItem(this.storageKey(normalizeRoomCode(roomCode)));
    if (!raw) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      return isRetroRoom(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  getCurrentPlayer(): RoomPlayer | null {
    const session = loadPlatformSession(this.sessionStorage);
    const room = session ? this.getRoom(session.roomCode) : null;
    return room?.players.find((player) => player.id === session?.playerId) ?? null;
  }

  getConnectionStatus(): 'connected' { return 'connected'; }

  async ensureRoom(roomCode: string): Promise<RetroRoom | null> {
    const code = normalizeRoomCode(roomCode);
    const session = loadPlatformSession(this.sessionStorage);
    if (session?.roomCode !== code) return null;
    const room = this.getRoom(code);
    if (!room) clearPlatformSession(this.sessionStorage);
    return room;
  }

  async beginGameSelection(candidateGameIds: readonly string[]): Promise<RetroRoom> {
    return this.updateCurrentRoom((room, session) => {
      if (!session.isHost) throw new RoomServiceError('HOST_REQUIRED');
      const votingStartedAt = this.now();
      const next: RetroRoom = {
        ...room,
        status: 'GAME_SELECTION',
        votes: {},
        votingStartedAt,
        votingEndsAt: votingStartedAt + room.votingTimeSeconds * 1000,
        candidateGameIds: [...candidateGameIds],
      };
      delete next.selectedGameId;
      delete next.tieBreak;
      return next;
    });
  }

  async castVote(gameId: string): Promise<RetroRoom> {
    return this.updateCurrentRoom((room, session) => {
      if (room.status !== 'GAME_SELECTION') return room;
      return { ...room, votes: { ...room.votes, [session.playerId]: gameId } };
    });
  }

  async updateAvatar(avatarId: string | undefined): Promise<RetroRoom> {
    return this.updateCurrentRoom((room, session) => ({
      ...room,
      players: room.players.map((player) =>
        (player.id === session.playerId ? { ...player, avatarId } : player)),
    }));
  }

  async resolveVote(candidateIds: readonly string[]): Promise<RetroRoom> {
    return this.updateCurrentRoom((room, session) => {
      if (!session.isHost) throw new RoomServiceError('HOST_REQUIRED');
      // Another tab may have resolved it already; keep the first result.
      if (room.status !== 'GAME_SELECTION') return room;
      const outcome = resolveVoteOutcome(room.votes, candidateIds, this.random);
      if (!outcome) return room;

      const next: RetroRoom = { ...room, selectedGameId: outcome.winner, status: 'PLAYING' };
      delete next.votingStartedAt;
      delete next.votingEndsAt;
      if (outcome.tiedCandidates.length > 1) {
        next.tieBreak = { candidates: outcome.tiedCandidates, winner: outcome.winner };
      } else {
        delete next.tieBreak;
      }
      savePlatformSession(this.sessionStorage, { ...session, selectedGameId: outcome.winner });
      return next;
    });
  }

  /**
   * Mirrors `RoomStore.ReturnToLobby` on the server: host-only, and it clears
   * the round rather than only flipping the status. Leaving a finished vote's
   * result behind would show the lobby a selected game nobody chose, and would
   * leave a stale countdown for the next round to trip over.
   */
  async returnToLobby(): Promise<RetroRoom> {
    return this.updateCurrentRoom((room, session) => {
      if (!session.isHost) throw new RoomServiceError('HOST_REQUIRED');
      const next: RetroRoom = { ...room, status: 'LOBBY', votes: {} };
      delete next.votingStartedAt;
      delete next.votingEndsAt;
      delete next.selectedGameId;
      delete next.tieBreak;
      return next;
    });
  }

  subscribe(roomCode: string, listener: RoomListener): () => void {
    if (!this.channel) return () => undefined;
    const normalized = normalizeRoomCode(roomCode);
    const handleMessage = (event: MessageEvent<ChannelMessage>) => {
      if (event.data.kind !== 'room') return;
      if (event.data.roomCode === normalized) listener(this.getRoom(normalized));
    };
    this.channel.addEventListener('message', handleMessage);
    return () => this.channel?.removeEventListener('message', handleMessage);
  }

  async sendReaction(emoji: string): Promise<void> {
    const session = loadPlatformSession(this.sessionStorage);
    const room = session ? this.getRoom(session.roomCode) : null;
    const player = room?.players.find((candidate) => candidate.id === session?.playerId);
    if (!room || !player) return;

    const reaction: RoomReaction = {
      playerId: player.id,
      displayName: player.displayName,
      color: player.color,
      emoji,
      sentAt: this.now(),
    };

    // BroadcastChannel does not echo to the tab that posted, but the sender has
    // to see their own emoji fly — against the real API the server includes
    // them in the broadcast, and the two modes must not look different.
    this.reactionListeners.get(room.code)?.forEach((listener) => listener(reaction));
    this.channel?.postMessage({ kind: 'reaction', roomCode: room.code, reaction });
  }

  subscribeToReactions(roomCode: string, listener: ReactionListener): () => void {
    const normalized = normalizeRoomCode(roomCode);
    const local = this.reactionListeners.get(normalized) ?? new Set<ReactionListener>();
    local.add(listener);
    this.reactionListeners.set(normalized, local);

    const handleMessage = (event: MessageEvent<ChannelMessage>) => {
      if (event.data.kind !== 'reaction') return;
      if (event.data.roomCode === normalized) listener(event.data.reaction);
    };
    this.channel?.addEventListener('message', handleMessage);

    return () => {
      local.delete(listener);
      if (local.size === 0) this.reactionListeners.delete(normalized);
      this.channel?.removeEventListener('message', handleMessage);
    };
  }

  private updateCurrentRoom(update: (room: RetroRoom, session: PlatformSession) => RetroRoom): RetroRoom {
    const session = loadPlatformSession(this.sessionStorage);
    const room = session ? this.getRoom(session.roomCode) : null;
    if (!session || !room) throw new RoomServiceError('NO_ACTIVE_ROOM');
    const next = update(room, session);
    this.writeRoom(next);
    return next;
  }

  private saveSession(room: RetroRoom, player: RoomPlayer): void {
    savePlatformSession(this.sessionStorage, {
      playerId: player.id,
      displayName: player.displayName,
      roomCode: room.code,
      isHost: player.isHost,
      ...(room.selectedGameId ? { selectedGameId: room.selectedGameId } : {}),
    });
  }

  private writeRoom(room: RetroRoom): void {
    this.roomStorage.setItem(this.storageKey(room.code), JSON.stringify(room));
    this.channel?.postMessage({ kind: 'room', roomCode: room.code, room });
  }

  private deleteRoom(roomCode: string): void {
    this.roomStorage.removeItem(this.storageKey(roomCode));
    this.channel?.postMessage({ kind: 'room', roomCode, room: null });
  }

  private storageKey(roomCode: string): string {
    return `${ROOM_STORAGE_PREFIX}${roomCode}`;
  }
}
