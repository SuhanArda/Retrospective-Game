import type { GameTransport } from './GameTransport';
import type { GameTransportListener, JoinRoomRequest, PlayerInputMessage, SelectTargetCommand, ShoveCommand, UseAbilityCommand } from './transportMessages';

/** Adapter boundary only. A future implementation should map these methods to approved hub DTOs. */
export class SignalRGameTransport implements GameTransport {
  private readonly listeners = new Set<GameTransportListener>();
  constructor(private readonly hubUrl?: string) {}

  async connect(request: JoinRoomRequest) {
    void request;
    const suffix = this.hubUrl ? '' : ' No VITE_HUB_URL is configured.';
    this.emit({ type: 'error', message: `SignalR transport is an integration skeleton.${suffix}` });
  }
  async disconnect() { this.emit({ type: 'connection', status: 'disconnected' }); }
  sendPlayerInput(input: PlayerInputMessage) { void input; }
  sendShove(command: ShoveCommand) { void command; }
  useAbility(command: UseAbilityCommand) { void command; }
  selectAbilityTarget(command: SelectTargetCommand) { void command; }
  subscribe(listener: GameTransportListener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private emit(event: Parameters<GameTransportListener>[0]) { this.listeners.forEach((listener) => listener(event)); }
}
