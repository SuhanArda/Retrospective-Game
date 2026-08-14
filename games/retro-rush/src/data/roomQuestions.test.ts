import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadRoomQuestions } from './roomQuestions';

describe('loadRoomQuestions', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sets a finite timeout on the optional AI request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ questions: [] }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadRoomQuestions('http://localhost:3002', 'ABC234')).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3002/rooms/ABC234/questions',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('rejects malformed content so the caller can retain authoritative defaults', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ questions: null }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })));

    await expect(loadRoomQuestions('http://localhost:3002', 'ABC234')).rejects.toThrow('INVALID_ROOM_QUESTIONS');
  });
});
