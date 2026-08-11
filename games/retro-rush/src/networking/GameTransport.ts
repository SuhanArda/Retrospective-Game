import type { JoinRoomRequest, PlayerInputMessage, SelectTargetCommand, ShoveCommand, UseAbilityCommand, GameTransportListener } from './transportMessages';

export interface GameTransport {
  connect(request: JoinRoomRequest): Promise<void>;
  disconnect(): Promise<void>;
  sendPlayerInput(input: PlayerInputMessage): void;
  sendShove(command: ShoveCommand): void;
  useAbility(command: UseAbilityCommand): void;
  selectAbilityTarget(command: SelectTargetCommand): void;
  subscribe(listener: GameTransportListener): () => void;
}
