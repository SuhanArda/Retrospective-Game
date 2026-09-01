import type { RoomRealtimeClient } from '@retro-platform/realtime-client';
import type {
  HideAndSeekInputRequest,
  HideAndSeekMapPayload,
  HideAndSeekPersonalSnapshot,
  HideAndSeekPlayerCaughtEvent,
  HideAndSeekStateSnapshot,
} from '@retro-platform/contracts';

export interface HideSeekGameStartedEvent {
  map: HideAndSeekMapPayload;
  state: HideAndSeekStateSnapshot;
}

/**
 * Wraps a `RoomRealtimeClient` down to the small event-driven shape the game
 * canvas actually needs — the same decoupling `RouletteRoomBridge` gives Rus
 * Ruleti's Phaser scene. The canvas never sees SignalR, launch contexts, or
 * game-session ids: just "here's the map", "here's your latest tick", "here's
 * the current phase", and "here's how to send input".
 */
export class HideSeekRoomBridge {
  private readonly gameStartedListeners = new Set<(event: HideSeekGameStartedEvent) => void>();
  private readonly snapshotListeners = new Set<(snapshot: HideAndSeekPersonalSnapshot) => void>();
  private readonly stateChangedListeners = new Set<(state: HideAndSeekStateSnapshot) => void>();
  private readonly playerCaughtListeners = new Set<(event: HideAndSeekPlayerCaughtEvent) => void>();
  private readonly disposers: Array<() => void> = [];
  /**
   * The map arrives once, potentially before the canvas has mounted and
   * subscribed — same "replay the last one on subscribe" reasoning
   * `RouletteRoomBridge` documents for its own first state.
   */
  private latestGameStarted: HideSeekGameStartedEvent | null = null;
  private latestState: HideAndSeekStateSnapshot | null = null;

  constructor(private readonly client: RoomRealtimeClient) {
    this.disposers.push(
      client.on('hideAndSeekGameStarted', (event) => {
        this.latestGameStarted = event;
        this.gameStartedListeners.forEach((listener) => listener(event));
        this.applyState(event.state);
      }),
      client.on('hideAndSeekSnapshot', (snapshot) => {
        this.snapshotListeners.forEach((listener) => listener(snapshot));
      }),
      client.on('hideAndSeekStateChanged', (state) => this.applyState(state)),
      client.on('playerCaught', (event) => this.playerCaughtListeners.forEach((listener) => listener(event))),
      // A rejoin or an unrelated room update also carries the latest phase
      // state on `room.hideAndSeekState` — a backup path for the rare case a
      // transient `hideAndSeekStateChanged` broadcast was missed mid-reconnect.
      client.on('roomSnapshot', (room) => {
        if (room.currentGameSession?.gameId !== 'hide-and-seek') return;
        if (room.hideAndSeekState) this.applyState(room.hideAndSeekState);
      }),
    );
  }

  private applyState(state: HideAndSeekStateSnapshot) {
    if (this.latestState && state.revision <= this.latestState.revision) return;
    this.latestState = state;
    this.stateChangedListeners.forEach((listener) => listener(state));
  }

  onGameStarted(listener: (event: HideSeekGameStartedEvent) => void): () => void {
    this.gameStartedListeners.add(listener);
    if (this.latestGameStarted) listener(this.latestGameStarted);
    return () => this.gameStartedListeners.delete(listener);
  }

  /** Fires whenever the phase (or anything else non-secret about the round) changes — not at tick rate. */
  onStateChanged(listener: (state: HideAndSeekStateSnapshot) => void): () => void {
    this.stateChangedListeners.add(listener);
    if (this.latestState) listener(this.latestState);
    return () => this.stateChangedListeners.delete(listener);
  }

  /** Fires up to `TICK_RATE` times per second — the authoritative reconciliation source for prediction. */
  onSnapshot(listener: (snapshot: HideAndSeekPersonalSnapshot) => void): () => void {
    this.snapshotListeners.add(listener);
    return () => this.snapshotListeners.delete(listener);
  }

  /** Fires once per catch — a toast/sound cue, no history replayed on late subscribe (unlike the state above, this is a one-off event, not a snapshot). */
  onPlayerCaught(listener: (event: HideAndSeekPlayerCaughtEvent) => void): () => void {
    this.playerCaughtListeners.add(listener);
    return () => this.playerCaughtListeners.delete(listener);
  }

  /** Fire-and-forget from the canvas's point of view — the server's reply arrives as `hideAndSeekSnapshot` events, never through this call. */
  sendInput(request: HideAndSeekInputRequest): void {
    void this.client.sendHideAndSeekInput(request).catch(() => undefined);
  }

  dispose(): void {
    this.disposers.forEach((dispose) => dispose());
  }
}
