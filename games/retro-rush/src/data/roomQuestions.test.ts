import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadRoomQuestions } from './roomQuestions';

describe('loadRoomQuestions', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sets a finite timeout on the optional AI request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ questions: [] }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadRoomQuestions('http://localhost:5281', 'ABC234', 'player-1', 'token-1')).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:5281/api/rooms/ABC234/questions',
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        headers: expect.objectContaining({
          'X-Player-Id': 'player-1', 'X-Reconnect-Token': 'token-1',
        }),
      }),
    );
  });

  it('rejects malformed content so the caller can retain authoritative defaults', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ questions: null }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })));

    await expect(loadRoomQuestions('http://localhost:5281', 'ABC234', 'player-1', 'token-1')).rejects.toThrow('INVALID_ROOM_QUESTIONS');
  });
});
