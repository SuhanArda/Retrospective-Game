import type { JoinRoomRequest, PlayerInputMessage, ShoveCommand, UseAbilityCommand, GameTransportListener } from './transportMessages';
import type { RetroRushPlayerSnapshot } from '@retro-platform/contracts';

export interface GameTransport {
  readonly mode: 'standalone' | 'online';
  readonly localPlayerId?: string;
  readonly gameSessionId?: string;
  connect(request: JoinRoomRequest): Promise<void>;
  disconnect(): Promise<void>;
  sendPlayerInput(input: PlayerInputMessage): void;
  sendShove(command: ShoveCommand): void;
  useAbility(command: UseAbilityCommand): void;
  sendPlayerSnapshot(snapshot: RetroRushPlayerSnapshot): void;
  requestShove(roundId: number, targetPlayerId: string, sequence: number): void;
  requestRocketFire(roundId: number): void;
  requestRocketHit(roundId: number, rocketId: string): void;
  requestPlayerElimination(roundId: number): void;
  completeQuestion(roundId: number, questionId: string): void;
  subscribe(listener: GameTransportListener): () => void;
}
