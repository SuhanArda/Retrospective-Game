import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadRoomQuestions } from './roomQuestions';

const questions = Array.from({ length: 20 }, (_, index) => ({
  id: `q-${index}`, text: `Soru ${index}?`, answer: `Cevap ${index}`, category: 'reflection', gameCategory: 'work',
}));
const set = {
  roomId: 'ABC234', roomInstanceId: 'instance', questionSetId: 'set', provider: 'gemini',
  generationStatus: 'ready', questions, createdAt: 1, updatedAt: 1,
};

describe('loadRoomQuestions', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('ortak oda endpointini sonlu timeout ile kullanır', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(set), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const first = loadRoomQuestions('http://localhost:5281', 'ABC234', 'player-1', 'token-1');
    const duplicate = loadRoomQuestions('http://localhost:5281', 'ABC234', 'player-1', 'token-1');
    await expect(Promise.all([first, duplicate])).resolves.toEqual([expect.any(Array), expect.any(Array)]);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:5281/api/rooms/ABC234/ai/questions',
      expect.objectContaining({ signal: expect.any(AbortSignal), headers: expect.objectContaining({
        'X-Player-Id': 'player-1', 'X-Reconnect-Token': 'token-1',
      }) }),
    );
  });

  it('bozuk içeriği reddeder', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...set, questions: null }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })));
    await expect(loadRoomQuestions('http://localhost:5281', 'ABC234', 'player-2', 'token-2')).rejects.toThrow('INVALID_ROOM_QUESTIONS');
  });

  it('does not permanently cache a request made before questions are ready', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(set), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadRoomQuestions('http://localhost:5281', 'ABC234', 'player-3', 'token-3'))
      .rejects.toThrow('ROOM_QUESTIONS_NOT_READY');
    await expect(loadRoomQuestions('http://localhost:5281', 'ABC234', 'player-3', 'token-3'))
      .resolves.toHaveLength(20);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
