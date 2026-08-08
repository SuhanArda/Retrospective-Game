import { MockRoomService } from './MockRoomService';
import { SignalRRoomService } from './SignalRRoomService';
import type { RoomService } from './RoomService';

const apiUrl = import.meta.env.VITE_API_URL;

/**
 * Real rooms when an API is configured, the browser-only simulation otherwise.
 *
 * The mock is kept because it is the only way to work on the UI without the
 * backend running — but it cannot reach another computer, so anything that
 * needs real players requires VITE_API_URL.
 */
export const isMockMode = typeof apiUrl !== 'string' || apiUrl.length === 0;

export const roomService: RoomService = isMockMode
  ? new MockRoomService(window.localStorage, window.sessionStorage)
  : new SignalRRoomService(`${apiUrl.replace(/\/$/, '')}/hubs/room`, window.sessionStorage);
