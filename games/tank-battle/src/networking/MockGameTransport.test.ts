import { describe, expect, it, vi } from 'vitest';
import { MockGameTransport } from './MockGameTransport';

describe('MockGameTransport', () => {
  it('hydrates a scene that subscribes after reconnect', async () => {
    const transport = new MockGameTransport();
    await transport.connect();
    const listener = vi.fn();

    transport.subscribe(listener);

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      type: 'snapshot',
      snapshot: expect.objectContaining({ phase: 'RUNNING', projectiles: [] }),
    }));
  });
});
