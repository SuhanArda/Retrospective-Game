import { RoomQuestionProvider } from '@retro-platform/realtime-client';
import { adaptRetroRushQuestions } from './retroRushQuestionAdapter';

export async function loadRoomQuestions(baseUrl: string, roomCode: string, playerId: string, reconnectToken: string) {
  const set = await new RoomQuestionProvider(baseUrl).getForRoom(roomCode, playerId, reconnectToken);
  return adaptRetroRushQuestions(set.questions);
}
