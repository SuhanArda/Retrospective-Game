import type { CreateRoomRequest, CreateRoomResult, JoinRoomRequest, JoinRoomResult, RetroRoom, RoomPlayer } from '../domain/room';
import type { RoomReaction } from '../domain/reactions';

export type RoomListener = (room: RetroRoom | null) => void;
export type ReactionListener = (reaction: RoomReaction) => void;
export type RoomConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export interface RoomService {
  createRoom(request: CreateRoomRequest): Promise<CreateRoomResult>;
  joinRoom(request: JoinRoomRequest): Promise<JoinRoomResult>;
  leaveRoom(): Promise<void>;

  /**
   * Resolves the room by connecting and re-attaching this browser's admitted
   * session. A public room snapshot is never treated as player membership.
   */
  ensureRoom(roomCode: string): Promise<RetroRoom | null>;

  /** Last known snapshot for the admitted local player. */
  getRoom(roomCode: string): RetroRoom | null;
  getCurrentRoom(): RetroRoom | null;
  getCurrentPlayer(): RoomPlayer | null;
  getConnectionStatus(): RoomConnectionStatus;

  /** Host-only. `candidateGameIds` is what the vote may choose between. */
  beginGameSelection(candidateGameIds: readonly string[]): Promise<RetroRoom>;
  castVote(gameId: string): Promise<RetroRoom>;
  /** Host-only. Closes the vote early; otherwise the countdown does it. */
  resolveVote(candidateIds: readonly string[]): Promise<RetroRoom>;
  returnToLobby(): Promise<RetroRoom>;

  subscribe(roomCode: string, listener: RoomListener): () => void;

  /**
   * Sends one emoji to everyone in the room. Never rejects: a reaction that
   * does not make it is not worth interrupting anyone over, and the server
   * drops the ones past the rate limit on purpose.
   */
  sendReaction(emoji: string): Promise<void>;

  /**
   * Reactions are events, not room state, so they arrive on their own channel
   * rather than inside a snapshot. Nothing replays them: a listener only hears
   * what is sent while it is attached.
   */
  subscribeToReactions(roomCode: string, listener: ReactionListener): () => void;
}

export class RoomServiceError extends Error {
  constructor(public readonly code: 'NO_ACTIVE_ROOM' | 'HOST_REQUIRED') {
    super(code);
    this.name = 'RoomServiceError';
  }
}
