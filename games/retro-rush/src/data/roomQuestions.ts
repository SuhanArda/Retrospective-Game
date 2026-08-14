import type { RetroQuestion, RetroQuestionCategory } from '../domain/types';

interface BotQuestion {
  id: string;
  text: string;
  category: string;
}

const categoryMap: Readonly<Record<string, RetroQuestionCategory>> = {
  reflection: 'Went well',
  teamwork: 'Appreciation',
  improvement: 'Improvement',
  fun: 'Team mood',
};

export async function loadRoomQuestions(baseUrl: string, roomCode: string): Promise<readonly RetroQuestion[]> {
  const response = await fetch(`${baseUrl}/rooms/${encodeURIComponent(roomCode)}/questions`, {
    signal: AbortSignal.timeout(3_000),
  });
  if (!response.ok) throw new Error('ROOM_QUESTIONS_UNAVAILABLE');
  const result = await response.json() as { questions?: unknown };
  if (!Array.isArray(result.questions)) throw new Error('INVALID_ROOM_QUESTIONS');
  return result.questions.flatMap((value): RetroQuestion[] => {
    if (typeof value !== 'object' || value === null) return [];
    const item = value as Partial<BotQuestion>;
    if (typeof item.id !== 'string' || typeof item.text !== 'string' || typeof item.category !== 'string') return [];
    return [{
      id: item.id,
      category: categoryMap[item.category] ?? 'Challenges',
      type: 'text',
      prompt: item.text,
      required: true,
    }];
  });
}

export async function deleteRoomQuestions(baseUrl: string, roomCode: string): Promise<void> {
  await fetch(`${baseUrl}/rooms/${encodeURIComponent(roomCode)}`, {
    method: 'DELETE', signal: AbortSignal.timeout(3_000),
  });
}
