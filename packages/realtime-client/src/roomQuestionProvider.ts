import type { GeneratedQuestion, RoomQuestionSet } from '@retro-platform/contracts';

function isQuestion(value: unknown): value is GeneratedQuestion {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== 'string' || typeof item.text !== 'string' || typeof item.answer !== 'string') return false;
  if (item.options !== undefined && (!Array.isArray(item.options) || !item.options.every((option) => typeof option === 'string'))) return false;
  if (item.correctOptionIndex !== undefined && !Number.isInteger(item.correctOptionIndex)) return false;
  return item.difficulty === undefined || item.difficulty === 'easy' || item.difficulty === 'medium' || item.difficulty === 'hard';
}

export function parseRoomQuestionSet(value: unknown): RoomQuestionSet {
  if (typeof value !== 'object' || value === null) throw new Error('INVALID_ROOM_QUESTIONS');
  const item = value as Record<string, unknown>;
  if (typeof item.roomId !== 'string' || typeof item.roomInstanceId !== 'string' || typeof item.questionSetId !== 'string'
      || (item.provider !== 'demo' && item.provider !== 'gemini') || item.generationStatus !== 'ready'
      || !Array.isArray(item.questions) || item.questions.length !== 20 || !item.questions.every(isQuestion)
      || typeof item.createdAt !== 'number' || typeof item.updatedAt !== 'number') throw new Error('INVALID_ROOM_QUESTIONS');
  return item as unknown as RoomQuestionSet;
}

export class RoomQuestionProvider {
  constructor(private readonly baseUrl: string) {}

  async getForRoom(roomId: string, playerId: string, reconnectToken: string, timeoutMs = 3_000): Promise<RoomQuestionSet> {
    const response = await fetch(`${this.baseUrl}/api/rooms/${encodeURIComponent(roomId)}/ai/questions`, {
      headers: { 'X-Player-Id': playerId, 'X-Reconnect-Token': reconnectToken },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(response.status === 404 ? 'ROOM_QUESTIONS_NOT_READY' : 'ROOM_QUESTIONS_UNAVAILABLE');
    return parseRoomQuestionSet(await response.json());
  }
}

/** Default adapter for future games that only need a stable question text. */
export function questionForStableKey(questions: readonly GeneratedQuestion[], key: string): GeneratedQuestion | null {
  if (questions.length === 0) return null;
  const numericSuffix = /(?:^|:)(\d+)$/.exec(key)?.[1];
  if (numericSuffix !== undefined) return questions[Number(numericSuffix) % questions.length] ?? null;
  const hash = [...key].reduce((total, character) => ((total * 31) + character.charCodeAt(0)) >>> 0, 0);
  return questions[hash % questions.length] ?? null;
}
