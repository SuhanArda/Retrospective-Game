import type { GameLaunchContext, TankBattleGameSnapshot } from '@retro-platform/contracts';
import type { RoomRealtimeClient } from '@retro-platform/realtime-client';
import type { GameTransport, TransportEvent } from './GameTransport';

export class SignalRGameTransport implements GameTransport {
  readonly mode = 'online' as const;
  readonly localPlayerId: string;
  private readonly gameSessionId: string;
  private readonly listeners = new Set<(event: TransportEvent) => void>();
  private readonly disposers: Array<() => void> = [];
  private latestSnapshot: TankBattleGameSnapshot | null = null;
  private generation = 0;

  constructor(private readonly roomClient: RoomRealtimeClient, context: GameLaunchContext) {
    this.localPlayerId = context.playerId;
    this.gameSessionId = context.gameSessionId;
  }

  async connect(): Promise<void> {
    const generation = ++this.generation;
    this.bind();
    try {
      const room = await this.roomClient.connect();
      if (generation !== this.generation) return;
      if (room.currentGameSession?.gameSessionId !== this.gameSessionId || room.currentGameSession.gameId !== 'tank-battle')
        throw new Error('WRONG_GAME_SESSION');
      this.accept(await this.roomClient.getTankBattleSnapshot(this.gameSessionId));
    } catch (error) { this.error(error); }
  }

  async disconnect(): Promise<void> {
    const generation = ++this.generation;
    await new Promise((resolve) => window.setTimeout(resolve, 1_500));
    if (generation !== this.generation) return;
    this.disposers.splice(0).forEach((dispose) => dispose());
    await this.roomClient.disconnect();
  }

  move(direction: -1 | 1): void { this.run(this.roomClient.moveTankBattleTank({ gameSessionId: this.gameSessionId, direction })); }
  fire(angle: number, power: number, facing: 'LEFT' | 'RIGHT'): void {
    this.run(this.roomClient.fireTankBattleShot({ gameSessionId: this.gameSessionId, facing, angle, power }));
  }
  completeQuestion(questionId: string): void { this.run(this.roomClient.completeTankBattleQuestion({ gameSessionId: this.gameSessionId, questionId })); }
  subscribe(listener: (event: TransportEvent) => void): () => void {
    this.listeners.add(listener);
    if (this.latestSnapshot) listener({ type: 'snapshot', snapshot: this.latestSnapshot });
    return () => this.listeners.delete(listener);
  }
  private bind(): void {
    if (this.disposers.length > 0) return;
    this.disposers.push(
      this.roomClient.on('connectionChanged', (status) => this.emit({ type: 'connection', status })),
      this.roomClient.on('tankBattleSnapshot', (snapshot) => this.accept(snapshot)),
    );
  }
  private accept(snapshot: TankBattleGameSnapshot): void {
    if (this.latestSnapshot && snapshot.revision < this.latestSnapshot.revision) return;
    this.latestSnapshot = snapshot;
    this.emit({ type: 'snapshot', snapshot });
  }
  private run(operation: Promise<TankBattleGameSnapshot>): void { void operation.catch((error: unknown) => this.error(error)); }
  private error(error: unknown): void { this.emit({ type: 'error', message: error instanceof Error ? error.message : 'Tank Battle network action failed' }); }
  private emit(event: TransportEvent): void { this.listeners.forEach((listener) => listener(event)); }
}
