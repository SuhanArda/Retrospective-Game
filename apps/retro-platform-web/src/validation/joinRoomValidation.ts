import { isValidRoomCode, normalizeRoomCode } from '../utils/roomCode';

export interface JoinRoomFormValues {
  roomCode: string;
  displayName: string;
}

export interface JoinRoomFormErrors {
  roomCode?: 'EMPTY_ROOM_CODE' | 'INVALID_ROOM_CODE';
  displayName?: 'EMPTY_DISPLAY_NAME';
}

export function validateJoinRoom(values: JoinRoomFormValues): JoinRoomFormErrors {
  const errors: JoinRoomFormErrors = {};
  const code = normalizeRoomCode(values.roomCode);
  if (!code) errors.roomCode = 'EMPTY_ROOM_CODE';
  else if (!isValidRoomCode(code)) errors.roomCode = 'INVALID_ROOM_CODE';
  if (!values.displayName.trim()) errors.displayName = 'EMPTY_DISPLAY_NAME';
  return errors;
}
