import { useEffect, useState } from 'react';
import type { RetroRoom } from '../domain/room';
import { roomService } from '../services/roomServiceInstance';

export interface RoomState {
  room: RetroRoom | null;
  /** True until the first snapshot resolves, so pages can tell "still connecting" from "no such room". */
  loading: boolean;
  setRoom: (room: RetroRoom | null) => void;
}

/**
 * Subscribes to a room and resolves its first snapshot.
 *
 * The distinction that matters here is loading vs. missing: against a real
 * server the first read is a round trip, and rendering "room not found"
 * during it would be wrong every single time someone opens a room link.
 */
export function useRoom(roomCode: string): RoomState {
  const [room, setRoom] = useState<RetroRoom | null>(() => roomService.getRoom(roomCode));
  const [loading, setLoading] = useState(() => roomService.getRoom(roomCode) === null);

  useEffect(() => roomService.subscribe(roomCode, setRoom), [roomCode]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    roomService
      .ensureRoom(roomCode)
      .then((next) => {
        if (active) setRoom(next);
      })
      .catch(() => {
        if (active) setRoom(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [roomCode]);

  return { room, loading, setRoom };
}
