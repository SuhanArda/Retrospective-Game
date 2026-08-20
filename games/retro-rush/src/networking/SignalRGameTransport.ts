import type { GameLaunchContext, RetroRushPlayerSnapshot } from '@retro-platform/contracts';
import type { RoomRealtimeClient } from '@retro-platform/realtime-client';
import type { AbilityId } from '../domain/types';
import type { GameTransport } from './GameTransport';
import type {
  GameTransportListener,
  JoinRoomRequest,
  PlayerInputMessage,
  SelectTargetCommand,
  ShoveCommand,
  UseAbilityCommand,
} from './transportMessages';
import { canSendRoundGameplay } from './roundStartDeadline';

export class SignalRGameTransport implements GameTransport {
  readonly mode = 'online' as const;
  readonly localPlayerId: string;
  readonly gameSessionId: string;
  private readonly listeners = new Set<GameTransportListener>();
  private readonly roomDisposers: Array<() => void> = [];
  private subscribed = false;
  private lifecycleGeneration = 0;
  private currentRoundId = 0;
  private roundStartAtUnixMs = 0;

  constructor(
    private readonly roomClient: RoomRealtimeClient,
    launchContext: GameLaunchContext,
  ) {
    this.localPlayerId = launchContext.playerId;
    this.gameSessionId = launchContext.gameSessionId;
  }

  async connect(request: JoinRoomRequest) {
    void request;
    const generation = ++this.lifecycleGeneration;
    this.bindRoomEvents();
    try {
      const room = await this.roomClient.connect();
      if (generation !== this.lifecycleGeneration) return;
      if (room.currentGameSession?.gameSessionId !== this.gameSessionId || room.currentGameSession.gameId !== 'retro-rush') {
        throw new Error('WRONG_GAME_SESSION');
      }
      const snapshot = await this.roomClient.getRetroRushSnapshot(this.gameSessionId);
      this.applyRoundAuthority(snapshot.roundId, snapshot.roundStartAtUnixMs);
      this.emit({ type: 'retroSnapshot', snapshot });
    } catch (error) {
      this.emitError(error);
    }
  }

  async disconnect() {
    const generation = ++this.lifecycleGeneration;
    // React Strict Mode immediately remounts development effects. Phaser's
    // teardown is asynchronous, so allow the replacement effect to supersede
    // this cleanup before stopping the shared hub.
    await new Promise((resolve) => window.setTimeout(resolve, 1_500));
    if (generation !== this.lifecycleGeneration) return;
    this.roomDisposers.splice(0).forEach((dispose) => dispose());
    this.subscribed = false;
    await this.roomClient.disconnect();
  }

  sendPlayerInput(input: PlayerInputMessage) { void input; }
  sendShove(command: ShoveCommand) { void command; }
  useAbility(command: UseAbilityCommand) {
    if (command.abilityId === 'rocket' || !this.canSendGameplay(this.currentRoundId)) return;
    this.run(this.roomClient.useRetroRushAbility({
      gameSessionId: this.gameSessionId, roundId: this.currentRoundId, abilityId: command.abilityId,
    }));
  }
  selectAbilityTarget(command: SelectTargetCommand) {
    if (!this.canSendGameplay(this.currentRoundId)) return;
    this.run(this.roomClient.requestRetroRushAskTarget({
      gameSessionId: this.gameSessionId, roundId: this.currentRoundId, targetPlayerId: command.targetPlayerId,
    }));
  }

  sendPlayerSnapshot(snapshot: RetroRushPlayerSnapshot) {
    if (!this.canSendGameplay(snapshot.roundId)) return;
    this.run(this.roomClient.updateRetroRushPlayer({
      gameSessionId: this.gameSessionId,
      playerId: this.localPlayerId,
      roundId: snapshot.roundId,
      x: snapshot.x,
      y: snapshot.y,
      velocityX: snapshot.velocityX,
      velocityY: snapshot.velocityY,
      facing: snapshot.facing,
      movementState: snapshot.movementState,
      animationState: snapshot.animationState,
      sequence: snapshot.sequence,
      clientTimestamp: snapshot.clientTimestamp,
    }));
  }

  requestShove(roundId: number, targetPlayerId: string, sequence: number) {
    if (!this.canSendGameplay(roundId)) return;
    this.runShove(this.roomClient.requestRetroRushShove({
      gameSessionId: this.gameSessionId, roundId, targetPlayerId, sequence,
    }));
  }

  requestRocketFire(roundId: number) {
    if (!this.canSendGameplay(roundId)) return;
    this.run(this.roomClient.requestRetroRushRocketFire({ gameSessionId: this.gameSessionId, roundId }));
  }

  requestRocketHit(roundId: number, rocketId: string) {
    if (!this.canSendGameplay(roundId)) return;
    this.run(this.roomClient.requestRetroRushRocketHit({ gameSessionId: this.gameSessionId, roundId, rocketId }));
  }

  requestPickupCollection(roundId: number, pickupId: string, abilityId: AbilityId) {
    if (!this.canSendGameplay(roundId)) return;
    this.run(this.roomClient.requestRetroRushPickupCollection({
      gameSessionId: this.gameSessionId, roundId, pickupId, abilityId,
    }));
  }

  requestPlayerElimination(roundId: number) {
    if (!this.canSendGameplay(roundId)) return;
    this.run(this.roomClient.requestRetroRushPlayerElimination({
      gameSessionId: this.gameSessionId, roundId, playerId: this.localPlayerId,
    }));
  }

  completeQuestion(roundId: number, questionId: string) {
    this.run(this.roomClient.completeRetroRushQuestion({ gameSessionId: this.gameSessionId, roundId, questionId }));
  }

  subscribe(listener: GameTransportListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private bindRoomEvents() {
    if (this.subscribed) return;
    this.subscribed = true;
    this.roomDisposers.push(
      this.roomClient.on('connectionChanged', (status) => this.emit({ type: 'connection', status })),
      this.roomClient.on('retroRushSnapshot', (snapshot) => { this.applyRoundAuthority(snapshot.roundId, snapshot.roundStartAtUnixMs); this.emit({ type: 'retroSnapshot', snapshot }); }),
      this.roomClient.on('retroRushPlayerUpdated', (player) => this.emit({ type: 'retroPlayerUpdated', player })),
      this.roomClient.on('retroRushShoveApplied', (shove) => this.emit({ type: 'retroShoveApplied', shove })),
      this.roomClient.on('retroRushRocketSpawned', (rocket) => this.emit({ type: 'retroRocketSpawned', rocket })),
      this.roomClient.on('retroRushRocketHit', (hit) => this.emit({ type: 'retroRocketHit', hit })),
      this.roomClient.on('retroRushPickupCollected', (pickup) => this.emit({ type: 'retroPickupCollected', pickup })),
      this.roomClient.on('retroRushPlayerEliminated', (elimination) => this.emit({ type: 'retroPlayerEliminated', elimination })),
      this.roomClient.on('retroRushRoundStarted', (snapshot) => { this.applyRoundAuthority(snapshot.roundId, snapshot.roundStartAtUnixMs); this.emit({ type: 'retroRoundStarted', snapshot }); }),
      this.roomClient.on('retroRushTargetQuestioned', (question) => this.emit({ type: 'retroTargetQuestioned', question })),
    );
  }

  private applyRoundAuthority(roundId: number, roundStartAtUnixMs: number) {
    if (roundId < this.currentRoundId) return;
    this.currentRoundId = roundId;
    this.roundStartAtUnixMs = roundStartAtUnixMs;
  }

  private canSendGameplay(roundId: number) {
    return canSendRoundGameplay(this.currentRoundId, roundId, this.roundStartAtUnixMs);
  }

  private run(operation: Promise<unknown>) { void operation.catch((error: unknown) => this.emitError(error)); }
  private runShove(operation: Promise<unknown>) {
    void operation.catch((error: unknown) => {
      if (import.meta.env.DEV) console.error('[RetroNet SHOVE_FAILED]', error);
      this.emitError(error);
    });
  }
  private emitError(error: unknown) {
    this.emit({ type: 'error', message: error instanceof Error ? error.message : 'Retro Rush network action failed' });
  }
  private emit(event: Parameters<GameTransportListener>[0]) {
    this.listeners.forEach((listener) => listener(event));
  }
}
