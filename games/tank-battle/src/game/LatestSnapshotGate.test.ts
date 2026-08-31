import { describe, expect, it, vi } from 'vitest';
import { LatestSnapshotGate } from './LatestSnapshotGate';

describe('LatestSnapshotGate', () => {
  it('buffers the latest snapshot until the scene is ready', () => {
    const apply = vi.fn<(snapshot: { revision: number }) => void>();
    const gate = new LatestSnapshotGate(apply);

    gate.start();
    gate.receive({ revision: 1 });
    gate.receive({ revision: 2 });

    expect(apply).not.toHaveBeenCalled();
    gate.markReady();
    expect(apply).toHaveBeenCalledOnce();
    expect(apply).toHaveBeenCalledWith({ revision: 2 });
  });

  it('applies live snapshots immediately and ignores stale callbacks after teardown', () => {
    const apply = vi.fn<(snapshot: { revision: number }) => void>();
    const gate = new LatestSnapshotGate(apply);

    gate.start();
    gate.markReady();
    gate.receive({ revision: 3 });
    gate.stop();
    gate.receive({ revision: 4 });

    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith({ revision: 3 });
  });
});
