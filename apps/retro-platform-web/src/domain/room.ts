export type RoomStatus = 'LOBBY' | 'GAME_SELECTION' | 'PLAYING' | 'FINISHED';

export interface RoomPlayer {
  id: string;
  displayName: string;
  color: string;
  isHost: boolean;
  isReady: boolean;
}

export interface RetroRoom {
  id: string;
  code: string;
  roomName: string;
  hostPlayerId: string;
  players: RoomPlayer[];
  selectedGameId?: string;
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
