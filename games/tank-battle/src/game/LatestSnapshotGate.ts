export class LatestSnapshotGate<T> {
  private active = false;
  private ready = false;
  private latest: T | null = null;

  constructor(private readonly apply: (snapshot: T) => void) {}

  start(): void {
    this.active = true;
    this.ready = false;
    this.latest = null;
  }

  receive(snapshot: T): void {
    if (!this.active) return;
    if (!this.ready) {
      this.latest = snapshot;
      return;
    }
    this.apply(snapshot);
  }

  markReady(): void {
    if (!this.active || this.ready) return;
    this.ready = true;
    const snapshot = this.latest;
    this.latest = null;
    if (snapshot) this.apply(snapshot);
  }

  stop(): void {
    this.active = false;
    this.ready = false;
    this.latest = null;
  }
}
