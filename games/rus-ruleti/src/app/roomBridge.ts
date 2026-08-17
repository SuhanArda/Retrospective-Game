import type { RoomRealtimeClient } from '@retro-platform/realtime-client';
import { questionForStableKey } from '@retro-platform/realtime-client';
import type { GeneratedQuestion } from '@retro-platform/contracts';
import type { RussianRouletteStateSnapshot } from '@retro-platform/contracts';

export interface RouletteBridgeState {
  holderId: string;
  status: 'IDLE' | 'QUESTION_ACTIVE';
  questionText?: string;
  /** Whose question this is — the person who was just shot, not the shooter. */
  lastTargetId?: string;
  revision: number;
}

export interface FireAnimationEvent {
  shooterId: string;
  targetId: string;
  hit: boolean;
}

/**
 * Wraps a `RoomRealtimeClient` down to the small event-driven shape
 * `RouletteScene` actually needs, the same way `GameEventBridge` decouples
 * retro-rush's Phaser scene from its transport. The scene never sees
 * SignalR, launch contexts, or game-session ids — just "here's the current
 * state" and "here's a fire to animate".
 */
export class RouletteRoomBridge {
  private readonly stateListeners = new Set<(state: RouletteBridgeState) => void>();
  private readonly fireListeners = new Set<(event: FireAnimationEvent) => void>();
  private readonly disposers: Array<() => void> = [];
  private latestRevision = 0;
  /**
   * The room's first snapshot lands while the canvas is still being mounted,
   * so the scene always subscribes after it. Keeping the last state here and
   * replaying it on subscribe is what stops that first one — the one that
   * says whose turn it is — from being lost.
   */
  private latestState: RouletteBridgeState | null = null;
  private latestRawState: RussianRouletteStateSnapshot | null = null;
  private questions: readonly GeneratedQuestion[] = [];

  constructor(private readonly client: RoomRealtimeClient, gameSessionId: string) {
    this.disposers.push(
      client.on('roomSnapshot', (room) => {
        if (room.currentGameSession?.gameSessionId !== gameSessionId) return;
        if (room.russianRouletteState) this.applyState(room.russianRouletteState);
      }),
      client.on('russianRouletteStateChanged', (state) => this.applyState(state)),
      client.on('fireResult', (result) => {
        if (result.gameSessionId !== gameSessionId) return;
        this.fireListeners.forEach((listener) => listener({
          shooterId: result.shooterPlayerId,
          targetId: result.targetPlayerId,
          hit: result.hit,
        }));
      }),
    );
  }

  private applyState(state: RussianRouletteStateSnapshot) {
    this.latestRawState = state;
    this.latestRevision = state.revision;
    const sharedQuestion = state.questionId ? questionForStableKey(this.questions, state.questionId) : null;
    this.latestState = {
      holderId: state.holderPlayerId,
      status: state.status,
      questionText: sharedQuestion?.text ?? state.questionText,
      lastTargetId: state.lastTargetPlayerId,
      revision: state.revision,
    };
    this.stateListeners.forEach((listener) => listener(this.latestState!));
  }

  setQuestions(questions: readonly GeneratedQuestion[]): void {
    this.questions = questions;
    if (this.latestRawState) this.applyState(this.latestRawState);
  }

  onStateChanged(listener: (state: RouletteBridgeState) => void): () => void {
    this.stateListeners.add(listener);
    if (this.latestState) listener(this.latestState);
    return () => this.stateListeners.delete(listener);
  }

  onFireResult(listener: (event: FireAnimationEvent) => void): () => void {
    this.fireListeners.add(listener);
    return () => this.fireListeners.delete(listener);
  }

  /** Fire-and-forget from the scene's point of view — the server's reply arrives as events above. */
  requestFire(targetId: string): void {
    void this.client.requestFire(targetId).catch(() => undefined);
  }

  completeQuestion(): void {
    void this.client.completeFireQuestion(this.latestRevision).catch(() => undefined);
  }

  dispose(): void {
    this.disposers.forEach((dispose) => dispose());
  }
}
