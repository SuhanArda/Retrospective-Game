import { MockRoomService } from './MockRoomService';

export const roomService = new MockRoomService(window.localStorage, window.sessionStorage);
