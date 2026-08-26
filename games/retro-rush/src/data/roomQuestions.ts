import { RoomQuestionProvider } from '@retro-platform/realtime-client';
import { adaptRetroRushQuestions } from './retroRushQuestionAdapter';

const roomQuestionRequests = new Map<string, Promise<ReturnType<typeof adaptRetroRushQuestions>>>();

export function loadRoomQuestions(baseUrl: string, roomCode: string, playerId: string, reconnectToken: string) {
  const cacheKey = `${baseUrl}\n${roomCode}\n${playerId}`;
  const existing = roomQuestionRequests.get(cacheKey);
  if (existing) return existing;
  const request = new RoomQuestionProvider(baseUrl)
    .getForRoom(roomCode, playerId, reconnectToken)
    .then((set) => adaptRetroRushQuestions(set.questions));
  roomQuestionRequests.set(cacheKey, request);
  return request;
}
