import type { RoomRealtimeClient } from '@retro-platform/realtime-client';
import type { DrawAndGuessStateSnapshot } from '@retro-platform/contracts';

export interface DrawAndGuessBridgeState {
  drawerId: string;
  roundNumber: number;
  correctGuesserIds: readonly string[];
  scores: Readonly<Record<string, number>>;
  revision: number;
  roundEndsAtUtc: number;
  wordLength: number;
  revealedLetters: Readonly<Record<number, string>>;
  lastRevealedIndex?: number;
}

export interface GuessEvent {
  playerId: string;
  displayName: string;
  correct: boolean;
  rank?: number;
  text?: string;
  points?: number;
}

export interface StrokeEvent {
  playerId: string;
  points: readonly number[];
  newStroke: boolean;
  color: string;
  isEraser: boolean;
}

export interface ShapeEvent {
  playerId: string;
  shapeType: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  color: string;
  filled: boolean;
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
  private readonly shapeListeners = new Set<(event: ShapeEvent) => void>();
  private readonly clearListeners = new Set<() => void>();
  private readonly wordRevealListeners = new Set<(word: string) => void>();
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
        console.log('[DrawAndGuess] Guess broadcast received:', result);
        this.guessListeners.forEach((listener) => listener({
          playerId: result.playerId,
          displayName: result.displayName,
          correct: result.correct,
          rank: result.rank,
          text: result.text,
          points: result.points,
        }));
      }),
      client.on('drawAndGuessStrokeReceived', (stroke) => {
        this.strokeListeners.forEach((listener) => listener({
          playerId: stroke.playerId,
          points: stroke.points,
          newStroke: stroke.newStroke,
          color: stroke.color,
          isEraser: stroke.isEraser,
        }));
      }),
      client.on('drawAndGuessShapeReceived', (shape) => {
        this.shapeListeners.forEach((listener) => listener({
          playerId: shape.playerId,
          shapeType: shape.shapeType,
          x0: shape.x0,
          y0: shape.y0,
          x1: shape.x1,
          y1: shape.y1,
          color: shape.color,
          filled: shape.filled,
        }));
      }),
      client.on('drawAndGuessCanvasCleared', () => {
        this.clearListeners.forEach((listener) => listener());
      }),
      client.on('drawAndGuessWordRevealed', (reveal) => {
        this.wordRevealListeners.forEach((listener) => listener(reveal.word));
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
      roundEndsAtUtc: state.roundEndsAtUtc,
      wordLength: state.wordLength,
      revealedLetters: state.revealedLetters,
      lastRevealedIndex: state.lastRevealedIndex,
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

  onShape(listener: (event: ShapeEvent) => void): () => void {
    this.shapeListeners.add(listener);
    return () => this.shapeListeners.delete(listener);
  }

  onCanvasCleared(listener: () => void): () => void {
    this.clearListeners.add(listener);
    return () => this.clearListeners.delete(listener);
  }

  /** Süre dolup kelime açıklandığında (kimse ya da herkes bilemedi) tetiklenir. */
  onWordReveal(listener: (word: string) => void): () => void {
    this.wordRevealListeners.add(listener);
    return () => this.wordRevealListeners.delete(listener);
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
      points: result.points,
    }));
  }

  nextRound(): void {
    void this.client.nextDrawAndGuessRound().catch(() => undefined);
  }

  /** Sadece çizen için işe yarar — sunucu başkasından gelen isteği reddeder. */
  requestLetterHint(): void {
    void this.client.requestDrawAndGuessLetterHint().catch(() => undefined);
  }

  /** Fire-and-forget — the server relays it to everyone else without acknowledging back. */
  sendStroke(points: readonly number[], newStroke: boolean, color: string, isEraser: boolean): void {
    void this.client.sendDrawAndGuessStroke(points, newStroke, color, isEraser).catch(() => undefined);
  }

  /** Fire-and-forget — bir "şekil damgası" tek mesaj, tıpkı fırça darbesi gibi güvenilir sayılır. */
  sendShape(shapeType: string, x0: number, y0: number, x1: number, y1: number, color: string, filled: boolean): void {
    void this.client.sendDrawAndGuessShape(shapeType, x0, y0, x1, y1, color, filled).catch(() => undefined);
  }

  clearCanvas(): void {
    void this.client.clearDrawAndGuessCanvas().catch(() => undefined);
  }

  dispose(): void {
    this.disposers.forEach((dispose) => dispose());
  }
}
