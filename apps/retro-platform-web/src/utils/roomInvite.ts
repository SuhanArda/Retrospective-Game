import { normalizeRoomCode } from './roomCode';

export function roomJoinPath(roomCode: string): string {
  const search = new URLSearchParams({ roomCode: normalizeRoomCode(roomCode) });
  return `/room/join?${search.toString()}`;
}

export function buildRoomInviteUrl(origin: string, roomCode: string): string {
  return new URL(roomJoinPath(roomCode), `${origin.replace(/\/$/, '')}/`).toString();
}
