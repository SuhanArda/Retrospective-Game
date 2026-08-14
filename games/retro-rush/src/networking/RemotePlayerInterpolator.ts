import type { RetroRushPlayerSnapshot } from '@retro-platform/contracts';

interface BufferedSnapshot {
  snapshot: RetroRushPlayerSnapshot;
  receivedAt: number;
}

export interface InterpolatedRemoteState {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  facing: 'left' | 'right';
  animationState: RetroRushPlayerSnapshot['animationState'];
}

export class RemotePlayerInterpolator {
  private readonly buffer: BufferedSnapshot[] = [];
  private lastSequence = -1;
  private roundId = -1;

  constructor(private readonly delayMs: number) {}

  reset(roundId: number) {
    this.buffer.length = 0;
    this.roundId = roundId;
    this.lastSequence = -1;
  }

  push(snapshot: RetroRushPlayerSnapshot, receivedAt: number): boolean {
    if (snapshot.roundId < this.roundId || (snapshot.roundId === this.roundId && snapshot.sequence <= this.lastSequence)) return false;
    if (snapshot.roundId !== this.roundId) {
      this.reset(snapshot.roundId);
    }
    this.lastSequence = snapshot.sequence;
    this.buffer.push({ snapshot, receivedAt });
    if (this.buffer.length > 8) this.buffer.shift();
    return true;
  }

  sample(now: number): InterpolatedRemoteState | null {
    if (this.buffer.length === 0) return null;
    const renderAt = now - this.delayMs;
    while (this.buffer.length > 2 && this.buffer[1]!.receivedAt <= renderAt) this.buffer.shift();
    const previous = this.buffer[0]!;
    const target = this.buffer[1];
    if (!target) return this.state(previous.snapshot);
    const duration = Math.max(1, target.receivedAt - previous.receivedAt);
    const alpha = Math.min(1, Math.max(0, (renderAt - previous.receivedAt) / duration));
    return {
      x: previous.snapshot.x + (target.snapshot.x - previous.snapshot.x) * alpha,
      y: previous.snapshot.y + (target.snapshot.y - previous.snapshot.y) * alpha,
      velocityX: previous.snapshot.velocityX + (target.snapshot.velocityX - previous.snapshot.velocityX) * alpha,
      velocityY: previous.snapshot.velocityY + (target.snapshot.velocityY - previous.snapshot.velocityY) * alpha,
      facing: target.snapshot.facing,
      animationState: target.snapshot.animationState,
    };
  }

  private state(snapshot: RetroRushPlayerSnapshot): InterpolatedRemoteState {
    return {
      x: snapshot.x, y: snapshot.y, velocityX: snapshot.velocityX, velocityY: snapshot.velocityY,
      facing: snapshot.facing, animationState: snapshot.animationState,
    };
  }
}
