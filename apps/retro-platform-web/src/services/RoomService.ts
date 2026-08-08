import type { CreateRoomRequest, CreateRoomResult, JoinRoomRequest, JoinRoomResult, RetroRoom, RoomPlayer } from '../domain/room';

export type RoomListener = (room: RetroRoom | null) => void;

export interface RoomService {
  createRoom(request: CreateRoomRequest): Promise<CreateRoomResult>;
  joinRoom(request: JoinRoomRequest): Promise<JoinRoomResult>;
  leaveRoom(): Promise<void>;

  /**
   * Resolves the room, connecting and re-attaching this browser's session
   * first if that has not happened yet. Pages await this on mount so a slow
   * connection reads as "loading" instead of "room not found".
   */
  ensureRoom(roomCode: string): Promise<RetroRoom | null>;

  /** Last known snapshot. Null before {@link ensureRoom} has resolved. */
  getRoom(roomCode: string): RetroRoom | null;
  getCurrentRoom(): RetroRoom | null;
  getCurrentPlayer(): RoomPlayer | null;

  /** Host-only. `candidateGameIds` is what the vote may choose between. */
  beginGameSelection(candidateGameIds: readonly string[]): Promise<RetroRoom>;
  castVote(gameId: string): Promise<RetroRoom>;
  /** Host-only. Closes the vote early; otherwise the countdown does it. */
  resolveVote(candidateIds: readonly string[]): Promise<RetroRoom>;
  returnToLobby(): Promise<RetroRoom>;

  subscribe(roomCode: string, listener: RoomListener): () => void;
}

export class RoomServiceError extends Error {
  constructor(public readonly code: 'NO_ACTIVE_ROOM' | 'HOST_REQUIRED') {
    super(code);
    this.name = 'RoomServiceError';
  }
}
