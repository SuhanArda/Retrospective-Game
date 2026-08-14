import type { RetroQuestion } from '../domain/types';
import { adaptRetroRushQuestions, type RoomQuestion } from './retroRushQuestionAdapter';

function authHeaders(playerId: string, reconnectToken: string): Record<string, string> {
  return { 'X-Player-Id': playerId, 'X-Reconnect-Token': reconnectToken };
}

export async function loadRoomQuestions(baseUrl: string, roomCode: string, playerId: string, reconnectToken: string): Promise<readonly RetroQuestion[]> {
  const response = await fetch(`${baseUrl}/api/rooms/${encodeURIComponent(roomCode)}/questions`, {
    headers: authHeaders(playerId, reconnectToken),
    signal: AbortSignal.timeout(3_000),
  });
  if (!response.ok) throw new Error('ROOM_QUESTIONS_UNAVAILABLE');
  const result = await response.json() as { questions?: unknown };
  if (!Array.isArray(result.questions)) throw new Error('INVALID_ROOM_QUESTIONS');
  const questions = result.questions.flatMap((value): RoomQuestion[] => {
    if (typeof value !== 'object' || value === null) return [];
    const item = value as Partial<RoomQuestion>;
    if (typeof item.id !== 'string' || typeof item.text !== 'string' || typeof item.category !== 'string') return [];
    if (item.gameCategory !== undefined && item.gameCategory !== 'work' && item.gameCategory !== 'entertainment') return [];
    return [{ id: item.id, text: item.text, category: item.category, ...(item.gameCategory ? { gameCategory: item.gameCategory } : {}) }];
  });
  return adaptRetroRushQuestions(questions);
}
