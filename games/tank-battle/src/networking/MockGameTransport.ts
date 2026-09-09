import {
  advanceMockTankPhysics,
  createMockBattle,
  fireMockShot,
  moveMockTank,
  resetMockRound,
  resolveMockShot,
} from '../domain/mockBattle';
import type { GameTransport, TransportEvent } from './GameTransport';

export class MockGameTransport implements GameTransport {
  readonly mode = 'standalone' as const;
  readonly localPlayerId = 'local';
  private snapshot = createMockBattle(this.localPlayerId);
  private readonly listeners = new Set<(event: TransportEvent) => void>();
  private readonly projectileTimers = new Map<string, number>();
  private botQuestionTimer: number | null = null;
  private airborneTimer: number | null = null;
  private lastAirborneTickAt = 0;
  private connected = false;

  async connect(): Promise<void> {
    this.connected = true;
    this.emit({ type: 'connection', status: 'connected' });
    this.emit({ type: 'snapshot', snapshot: this.snapshot });
    this.startAirbornePhysics();
  }
  async disconnect(): Promise<void> {
    this.connected = false;
    if (this.botQuestionTimer !== null) window.clearTimeout(this.botQuestionTimer);
    if (this.airborneTimer !== null) window.clearInterval(this.airborneTimer);
    this.airborneTimer = null;
    this.projectileTimers.forEach((timer) => window.clearTimeout(timer));
    this.projectileTimers.clear();
    this.emit({ type: 'connection', status: 'disconnected' });
  }
  move(direction: -1 | 1): void {
    this.snapshot = moveMockTank(this.snapshot, this.localPlayerId, direction);
    this.emit({ type: 'snapshot', snapshot: this.snapshot });
  }
  fire(angle: number, power: number, facing: 'LEFT' | 'RIGHT'): void {
    const previousShotId = this.snapshot.lastShot?.shotId;
    this.snapshot = {
      ...this.snapshot,
      players: this.snapshot.players.map((player) => player.playerId === this.localPlayerId ? { ...player, facing } : player),
    };
    this.snapshot = fireMockShot(this.snapshot, this.localPlayerId, angle, power);
    this.emit({ type: 'snapshot', snapshot: this.snapshot });
    const shot = this.snapshot.lastShot;
    if (!shot || shot.shotId === previousShotId || shot.status !== 'ACTIVE') return;
    const timer = window.setTimeout(() => {
      this.projectileTimers.delete(shot.shotId);
      this.snapshot = resolveMockShot(this.snapshot, shot.shotId);
      this.emit({ type: 'snapshot', snapshot: this.snapshot });
      this.startAirbornePhysics();
      this.scheduleBotQuestionReset();
    }, Math.max(0, shot.impactAtUnixMs - Date.now()));
    this.projectileTimers.set(shot.shotId, timer);
  }
  private startAirbornePhysics(): void {
    if (this.airborneTimer !== null || !this.snapshot.players.some((tank) => tank.airborne)) return;
    this.lastAirborneTickAt = Date.now();
    this.airborneTimer = window.setInterval(() => {
      const now = Date.now();
      this.snapshot = advanceMockTankPhysics(this.snapshot, (now - this.lastAirborneTickAt) / 1_000);
      this.lastAirborneTickAt = now;
      this.emit({ type: 'snapshot', snapshot: this.snapshot });
      if (this.snapshot.players.some((tank) => tank.airborne)) return;
      window.clearInterval(this.airborneTimer!);
      this.airborneTimer = null;
    }, 50);
  }
  private scheduleBotQuestionReset(): void {
    const local = this.snapshot.players.find((player) => player.playerId === this.localPlayerId);
    if (this.snapshot.activeQuestion && local?.team !== this.snapshot.activeQuestion.loserTeam) {
      this.botQuestionTimer = window.setTimeout(() => {
        this.snapshot = resetMockRound(this.snapshot);
        this.emit({ type: 'snapshot', snapshot: this.snapshot });
        this.botQuestionTimer = null;
      }, 1_800);
    }
  }
  completeQuestion(questionId: string): void {
    if (this.snapshot.activeQuestion?.questionId !== questionId) return;
    this.snapshot = resetMockRound(this.snapshot);
    this.emit({ type: 'snapshot', snapshot: this.snapshot });
  }
  subscribe(listener: (event: TransportEvent) => void): () => void {
    this.listeners.add(listener);
    if (this.connected) listener({ type: 'snapshot', snapshot: this.snapshot });
    return () => this.listeners.delete(listener);
  }
  private emit(event: TransportEvent): void { this.listeners.forEach((listener) => listener(event)); }
}
