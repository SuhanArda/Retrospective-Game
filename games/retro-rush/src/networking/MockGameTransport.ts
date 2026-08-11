import type { GameTransport } from './GameTransport';
import type { GameTransportListener, JoinRoomRequest, PlayerInputMessage, SelectTargetCommand, ShoveCommand, UseAbilityCommand } from './transportMessages';

export class MockGameTransport implements GameTransport {
  private readonly listeners = new Set<GameTransportListener>();
  private connected = false;

  async connect(request: JoinRoomRequest) {
    this.emit({ type: 'connection', status: 'connecting' });
    await Promise.resolve();
    this.connected = true;
    this.emit({ type: 'connection', status: 'connected' });
    this.emit({ type: 'roomJoined', roomCode: request.roomCode, players: [] });
  }

  async disconnect() {
    this.connected = false;
    this.emit({ type: 'connection', status: 'disconnected' });
  }

  sendPlayerInput(input: PlayerInputMessage) { void input; /* mock authority is simulated by GameScene */ }
  sendShove(command: ShoveCommand) { void command; /* mock authority is simulated by GameScene */ }
  useAbility(command: UseAbilityCommand) { if (this.connected) this.emit({ type: 'abilityAccepted', abilityId: command.abilityId }); }
  selectAbilityTarget(command: SelectTargetCommand) { if (this.connected) this.emit({ type: 'targetQuestioned', playerId: command.targetPlayerId }); }

  subscribe(listener: GameTransportListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: Parameters<GameTransportListener>[0]) {
    this.listeners.forEach((listener) => listener(event));
  }
}
