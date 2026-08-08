import type { CreateRoomRequest, CreateRoomResult, JoinRoomRequest, JoinRoomResult, RetroRoom, RoomPlayer } from '../domain/room';

export type RoomListener = (room: RetroRoom | null) => void;

export interface RoomService {
  createRoom(request: CreateRoomRequest): Promise<CreateRoomResult>;
  joinRoom(request: JoinRoomRequest): Promise<JoinRoomResult>;
  leaveRoom(): Promise<void>;
  getCurrentRoom(): RetroRoom | null;
  getRoom(roomCode: string): RetroRoom | null;
  getCurrentPlayer(): RoomPlayer | null;
  beginGameSelection(): Promise<RetroRoom>;
  castVote(gameId: string): Promise<RetroRoom>;
  /** Host-only. Closes the vote and records the winning game (and any tie-break). */
  resolveVote(candidateIds: readonly string[]): Promise<RetroRoom>;
  selectGame(gameId: string): Promise<RetroRoom>;
  returnToLobby(): Promise<RetroRoom>;
  subscribe(roomCode: string, listener: RoomListener): () => void;
}

export class RoomServiceError extends Error {
  constructor(public readonly code: 'NO_ACTIVE_ROOM' | 'HOST_REQUIRED') {
    super(code);
    this.name = 'RoomServiceError';
  }
}
