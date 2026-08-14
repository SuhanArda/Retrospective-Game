import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareRoomQuestions, roomQuestionsAreReady } from './QuestionBotService';

const validQuestions = Array.from({ length: 15 }, (_, index) => ({
  id: `question-${index}`,
  text: `Question ${index}`,
  category: 'reflection',
}));

describe('QuestionBotService', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses the room question endpoint with a finite timeout', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      gameId: 'retro-rush', provider: 'demo', questions: validQuestions,
    }), { status: 201, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(prepareRoomQuestions({
      roomCode: 'ABC234', gameId: 'retro-rush', style: 'dengeli',
    })).resolves.toMatchObject({ gameId: 'retro-rush', questions: validQuestions });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3002/rooms/ABC234/questions',
      expect.objectContaining({
        method: 'POST', keepalive: true, signal: expect.any(AbortSignal),
      }),
    );
  });

  it('rejects a healthy HTTP response with a malformed question contract', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      gameId: 'retro-rush', provider: 'demo', questions: 'not-an-array',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    await expect(roomQuestionsAreReady('ABC234', 'retro-rush')).rejects.toThrow('INVALID_ROOM_QUESTIONS');
  });

  it('treats a failed question endpoint as unavailable even when health can be healthy', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500 })));

    await expect(prepareRoomQuestions({
      roomCode: 'ABC234', gameId: 'retro-rush', style: 'dengeli',
    })).rejects.toThrow('QUESTION_PREPARATION_FAILED');
  });
});
