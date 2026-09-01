import type { TankBattleGameSnapshot } from '@retro-platform/contracts';

interface GameToUiEvents {
  snapshot: TankBattleGameSnapshot;
  aimChanged: { angle: number; power: number };
  announcement: string;
}

interface UiToGameEvents {
  audioMuted: { muted: boolean };
  aimPointerMoved: { pageX: number; pageY: number };
  firePointerPressed: { pageX: number; pageY: number };
}

type EventMap = GameToUiEvents & UiToGameEvents;
type Listener<T> = (payload: T) => void;

export class GameEventBridge {
  private readonly listeners = new Map<keyof EventMap, Set<Listener<never>>>();

  on<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): () => void {
    const bucket = this.listeners.get(event) ?? new Set<Listener<never>>();
    bucket.add(listener as Listener<never>);
    this.listeners.set(event, bucket);
    return () => bucket.delete(listener as Listener<never>);
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    this.listeners.get(event)?.forEach((listener) => listener(payload as never));
  }
}
