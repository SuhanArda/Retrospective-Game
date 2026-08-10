export type RoomStatus = 'LOBBY' | 'GAME_SELECTION' | 'PLAYING' | 'FINISHED';

export interface RoomPlayer {
  id: string;
  displayName: string;
  color: string;
  isHost: boolean;
  isReady: boolean;
}

/** Records that a draw was settled at random, so the UI can show it happening. */
export interface TieBreak {
  candidates: string[];
  winner: string;
}

export interface RetroRoom {
  id: string;
  code: string;
  roomName: string;
  hostPlayerId: string;
  players: RoomPlayer[];
  selectedGameId?: string;
  /** playerId -> gameId, collected during GAME_SELECTION. */
  votes?: Record<string, string>;
  /** Epoch ms when the vote closes; absent once the vote is resolved. */
  votingEndsAt?: number;
  /** The games this round may choose between, so the server can close the vote itself. */
  candidateGameIds?: string[];
  tieBreak?: TieBreak;
  status: RoomStatus;
  maxParticipants: number;
  questionTimeSeconds: number;
  votingTimeSeconds: number;
  fileName?: string;
  description?: string;
  createdAt: number;
}

export interface CreateRoomRequest {
  displayName: string;
  color: string;
  roomName: string;
  maxParticipants: number;
  questionTimeSeconds: number;
  votingTimeSeconds: number;
  fileName?: string;
  description?: string;
}

export interface JoinRoomRequest {
  roomCode: string;
  displayName: string;
  color: string;
}

export interface CreateRoomResult {
  room: RetroRoom;
  player: RoomPlayer;
}

export type JoinRoomErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'ROOM_ALREADY_STARTED'
  | 'INVALID_ROOM_CODE';

export type JoinRoomResult =
  | { ok: true; room: RetroRoom; player: RoomPlayer }
  | { ok: false; error: JoinRoomErrorCode };
