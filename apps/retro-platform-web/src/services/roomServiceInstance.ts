import { MockRoomService } from './MockRoomService';
import { SignalRRoomService } from './SignalRRoomService';
import type { RoomService } from './RoomService';

const apiUrl = typeof import.meta.env.VITE_API_URL === 'string' && import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL
  : (() => { throw new Error('Missing required build-time environment variable: VITE_API_URL'); })();
const roomServiceMode = import.meta.env.VITE_ROOM_SERVICE;

/**
 * Real rooms when an API is configured, the browser-only simulation otherwise.
 *
 * The mock is kept because it is the only way to work on the UI without the
 * backend running — but it cannot reach another computer, so anything that
 * needs real players requires VITE_API_URL.
 */
export const isMockMode = roomServiceMode === 'mock';

export const roomService: RoomService = isMockMode
  ? new MockRoomService(window.localStorage, window.sessionStorage)
  : new SignalRRoomService(apiUrl.replace(/\/$/, ''), window.sessionStorage);
