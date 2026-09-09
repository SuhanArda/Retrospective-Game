import type { TankBattleGameSnapshot } from '@retro-platform/contracts';

export type TransportEvent =
  | { type: 'snapshot'; snapshot: TankBattleGameSnapshot }
  | { type: 'connection'; status: 'connecting' | 'connected' | 'reconnecting' | 'disconnected' }
  | { type: 'error'; message: string };

export interface GameTransport {
  readonly mode: 'standalone' | 'online';
  readonly localPlayerId: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  move(direction: -1 | 1): void;
  fire(angle: number, power: number, facing: 'LEFT' | 'RIGHT'): void;
  completeQuestion(questionId: string): void;
  subscribe(listener: (event: TransportEvent) => void): () => void;
}
