import { describe, expect, it, vi } from 'vitest';
import { MockGameTransport } from './MockGameTransport';

describe('mock transport', () => {
  it('connects and confirms submitted answers', async () => {
    const transport = new MockGameTransport();
    const listener = vi.fn();
    transport.subscribe(listener);
    await transport.connect({ roomCode: 'DX-204', playerName: 'Local Player' });
    transport.submitRetroAnswer({ questionId: 'q1', value: 'Good pairing', skipped: false, clientTime: 1 });
    expect(listener).toHaveBeenCalledWith({ type: 'connection', status: 'connected' });
    expect(listener).toHaveBeenCalledWith({ type: 'answerAccepted', questionId: 'q1' });
  });
});
