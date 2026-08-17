import type { GeneratedQuestion } from '@retro-platform/contracts';
import { RoomQuestionProvider } from '@retro-platform/realtime-client';

export type BotQuestion = GeneratedQuestion;

export async function loadRoomQuestions(baseUrl: string, roomCode: string, playerId: string, reconnectToken: string): Promise<BotQuestion[]> {
  const set = await new RoomQuestionProvider(baseUrl).getForRoom(roomCode, playerId, reconnectToken);
  return set.questions;
}
