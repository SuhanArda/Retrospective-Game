import { describe, expect, it, vi } from 'vitest';
import { MockGameTransport } from './MockGameTransport';

describe('mock transport', () => {
  it('connects while accepting locally simulated shove intents', async () => {
    const transport = new MockGameTransport();
    const listener = vi.fn();
    transport.subscribe(listener);
    await transport.connect({ roomCode: 'DX-204', playerName: 'Local Player' });
    transport.sendShove({ sequence: 1, clientTime: 1 });
    expect(listener).toHaveBeenCalledWith({ type: 'connection', status: 'connected' });
    expect(listener).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
  });
});
