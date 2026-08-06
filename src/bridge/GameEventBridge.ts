import type { AbilityId, MatchSnapshot, RetroAnswer, RetroQuestion } from '../domain/types';

export interface GameToUiEvents {
  snapshot: MatchSnapshot;
  questionOpened: RetroQuestion;
  targetSelectionOpened: { protectedTargets: Readonly<Record<string, number>> };
  answerCollected: RetroAnswer;
  announcement: string;
}

export interface UiToGameEvents {
  startMatch: undefined;
  restartMatch: undefined;
  answerSubmitted: { question: RetroQuestion; value: string; skipped: boolean };
  targetSelected: { playerId: string };
  targetSelectionCancelled: undefined;
  abilityRequested: { abilityId: AbilityId };
  audioMuted: { muted: boolean };
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

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]) {
    this.listeners.get(event)?.forEach((listener) => listener(payload as never));
  }

  clear() { this.listeners.clear(); }
}
