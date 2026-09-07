import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareRoomQuestions, roomQuestionsAreReady } from './QuestionBotService';
import { getQuestionPreparationState } from './QuestionPreparationState';

const validQuestions = Array.from({ length: 20 }, (_, index) => ({
  id: `question-${index}`,
  text: `Question ${index}`,
  answer: `Answer ${index}`,
  category: 'reflection',
}));

const validSet = {
  roomId: 'ABC234', roomInstanceId: 'instance-1', questionSetId: 'set-1',
  provider: 'demo', generationStatus: 'ready', questions: validQuestions,
  createdAt: 1, updatedAt: 1,
};

describe('QuestionBotService', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it.each([
    [undefined, null], ['', null], ['   ', null],
    [' Sprint iletişimi ve geliştirme alanları ', 'Sprint iletişimi ve geliştirme alanları'],
  ])('sends the normalized optional prompt %s', async (contextPrompt, topic) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(validSet), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    await prepareRoomQuestions({ roomCode: 'ABC234', style: 'dengeli', contextPrompt,
      playerId: 'player-1', reconnectToken: 'token-1' });
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({
      topic, reportText: null, reportFile: null, language: 'tr', style: 'dengeli', count: 20, replaceExisting: false,
    });
  });

  it('uses the room question endpoint with a finite timeout', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(validSet), { status: 201, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(prepareRoomQuestions({
      roomCode: 'ABC234', style: 'dengeli',
      playerId: 'player-1', reconnectToken: 'token-1',
    })).resolves.toMatchObject({ roomId: 'ABC234', questions: validQuestions });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:5281/api/rooms/ABC234/ai/questions',
      expect.objectContaining({
        method: 'POST', keepalive: true, signal: expect.any(AbortSignal),
        headers: expect.objectContaining({
          'X-Player-Id': 'player-1', 'X-Reconnect-Token': 'token-1',
        }),
      }),
    );
    expect(timeout).toHaveBeenCalledWith(135_000);
  });

  it('keeps preparation pending until the original POST resolves and reports Gemini readiness', async () => {
    let resolveResponse!: (response: Response) => void;
    const fetchMock = vi.fn().mockReturnValue(new Promise<Response>(resolve => { resolveResponse = resolve; }));
    vi.stubGlobal('fetch', fetchMock);
    const pending = prepareRoomQuestions({ roomCode: 'ABC234', style: 'dengeli', playerId: 'player-1', reconnectToken: 'token-1' });
    expect(getQuestionPreparationState()).toEqual({ roomCode: 'ABC234', status: 'preparing' });
    resolveResponse(new Response(JSON.stringify({ ...validSet, provider: 'gemini' }), { status: 201 }));
    await pending;
    expect(getQuestionPreparationState()).toEqual({ roomCode: 'ABC234', status: 'ready' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects a healthy HTTP response with a malformed question contract', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      gameId: 'retro-rush', provider: 'demo', questions: 'not-an-array',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    await expect(roomQuestionsAreReady('ABC234', 'player-1', 'token-1')).rejects.toThrow('INVALID_ROOM_QUESTIONS');
  });

  it('treats a failed question endpoint as unavailable even when health can be healthy', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500 })));

    await expect(prepareRoomQuestions({
      roomCode: 'ABC234', style: 'dengeli',
      playerId: 'player-1', reconnectToken: 'token-1',
    })).rejects.toThrow('QUESTION_PREPARATION_FAILED');
    expect(getQuestionPreparationState()).toEqual({ roomCode: 'ABC234', status: 'fallback' });
  });
});
