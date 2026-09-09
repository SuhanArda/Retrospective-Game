export class ServerClock {
  private offsetMs: number | null = null;

  observe(serverTimeUnixMs: number, receivedAtUnixMs = Date.now()): void {
    const sample = serverTimeUnixMs - receivedAtUnixMs;
    this.offsetMs = this.offsetMs === null ? sample : Math.max(this.offsetMs, sample);
  }

  now(localTimeUnixMs = Date.now()): number {
    return localTimeUnixMs + (this.offsetMs ?? 0);
  }
}
