import type { JoinRoomRequest, PlayerInputMessage, SelectTargetCommand, SubmitRetroAnswerCommand, UseAbilityCommand, GameTransportListener } from './transportMessages';

export interface GameTransport {
  connect(request: JoinRoomRequest): Promise<void>;
  disconnect(): Promise<void>;
  sendPlayerInput(input: PlayerInputMessage): void;
  useAbility(command: UseAbilityCommand): void;
  selectAbilityTarget(command: SelectTargetCommand): void;
  submitRetroAnswer(command: SubmitRetroAnswerCommand): void;
  subscribe(listener: GameTransportListener): () => void;
}
