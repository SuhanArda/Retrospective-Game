import type { RoomRealtimeClient } from '@retro-platform/realtime-client';
import type { DrawAndGuessStateSnapshot } from '@retro-platform/contracts';

export interface DrawAndGuessBridgeState {
  drawerId: string;
  roundNumber: number;
  correctGuesserIds: readonly string[];
  scores: Readonly<Record<string, number>>;
  revision: number;
}

export interface GuessEvent {
  playerId: string;
  displayName: string;
  correct: boolean;
  rank?: number;
  text?: string;
}

export interface StrokeEvent {
  playerId: string;
  points: readonly number[];
  newStroke: boolean;
}

/**
 * Wraps a `RoomRealtimeClient` down to the small event-driven shape the
 * React UI actually needs, the same way `RouletteRoomBridge` decouples
 * rus-ruleti's scene from SignalR. The UI never sees a hub connection or a
 * launch context — just "here's the current round" and "here's what someone
 * just did".
 */
export class DrawAndGuessRoomBridge {
  private readonly stateListeners = new Set<(state: DrawAndGuessBridgeState) => void>();
  private readonly guessListeners = new Set<(event: GuessEvent) => void>();
  private readonly strokeListeners = new Set<(event: StrokeEvent) => void>();
  private readonly clearListeners = new Set<() => void>();
  private readonly disposers: Array<() => void> = [];
  private latestState: DrawAndGuessBridgeState | null = null;

  constructor(private readonly client: RoomRealtimeClient, gameSessionId: string) {
    this.disposers.push(
      client.on('roomSnapshot', (room) => {
        if (room.currentGameSession?.gameSessionId !== gameSessionId) return;
        if (room.drawAndGuessState) this.applyState(room.drawAndGuessState);
      }),
      client.on('drawAndGuessStateChanged', (state) => this.applyState(state)),
      client.on('drawAndGuessGuessSubmitted', (result) => {
        this.guessListeners.forEach((listener) => listener({
          playerId: result.playerId,
          displayName: result.displayName,
          correct: result.correct,
          rank: result.rank,
          text: result.text,
        }));
      }),
      client.on('drawAndGuessStrokeReceived', (stroke) => {
        this.strokeListeners.forEach((listener) => listener({
          playerId: stroke.playerId,
          points: stroke.points,
          newStroke: stroke.newStroke,
        }));
      }),
      client.on('drawAndGuessCanvasCleared', () => {
        this.clearListeners.forEach((listener) => listener());
      }),
    );
  }

  private applyState(state: DrawAndGuessStateSnapshot) {
    this.latestState = {
      drawerId: state.drawerPlayerId,
      roundNumber: state.roundNumber,
      correctGuesserIds: state.correctGuesserIds,
      scores: state.scores,
      revision: state.revision,
    };
    this.stateListeners.forEach((listener) => listener(this.latestState!));
  }

  onStateChanged(listener: (state: DrawAndGuessBridgeState) => void): () => void {
    this.stateListeners.add(listener);
    if (this.latestState) listener(this.latestState);
    return () => this.stateListeners.delete(listener);
  }

  onGuess(listener: (event: GuessEvent) => void): () => void {
    this.guessListeners.add(listener);
    return () => this.guessListeners.delete(listener);
  }

  onStroke(listener: (event: StrokeEvent) => void): () => void {
    this.strokeListeners.add(listener);
    return () => this.strokeListeners.delete(listener);
  }

  onCanvasCleared(listener: () => void): () => void {
    this.clearListeners.add(listener);
    return () => this.clearListeners.delete(listener);
  }

  /** Only resolves for the caller — the server never broadcasts a word. */
  requestWord(): Promise<string> {
    return this.client.requestDrawAndGuessWord();
  }

  submitGuess(text: string): Promise<GuessEvent> {
    return this.client.submitDrawAndGuessGuess(text).then((result) => ({
      playerId: result.playerId,
      displayName: result.displayName,
      correct: result.correct,
      rank: result.rank,
      text: result.text,
    }));
  }

  nextRound(): void {
    void this.client.nextDrawAndGuessRound().catch(() => undefined);
  }

  /** Fire-and-forget — the server relays it to everyone else without acknowledging back. */
  sendStroke(points: readonly number[], newStroke: boolean): void {
    void this.client.sendDrawAndGuessStroke(points, newStroke).catch(() => undefined);
  }

  clearCanvas(): void {
    void this.client.clearDrawAndGuessCanvas().catch(() => undefined);
  }

  dispose(): void {
    this.disposers.forEach((dispose) => dispose());
  }
}
