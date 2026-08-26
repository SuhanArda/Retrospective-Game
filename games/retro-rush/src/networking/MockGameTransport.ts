import type { GameTransport } from './GameTransport';
import type { GameTransportListener, JoinRoomRequest, PlayerInputMessage, ShoveCommand, UseAbilityCommand } from './transportMessages';

export class MockGameTransport implements GameTransport {
  readonly mode = 'standalone' as const;
  readonly localPlayerId = undefined;
  readonly gameSessionId = undefined;
  private readonly listeners = new Set<GameTransportListener>();

  async connect(request: JoinRoomRequest) {
    this.emit({ type: 'connection', status: 'connecting' });
    await Promise.resolve();
    this.emit({ type: 'connection', status: 'connected' });
    this.emit({ type: 'roomJoined', roomCode: request.roomCode, players: [] });
  }

  async disconnect() {
    this.emit({ type: 'connection', status: 'disconnected' });
  }

  sendPlayerInput(input: PlayerInputMessage) { void input; /* mock authority is simulated by GameScene */ }
  sendShove(command: ShoveCommand) { void command; /* mock authority is simulated by GameScene */ }
  useAbility(command: UseAbilityCommand) { void command; /* standalone authority is simulated by GameScene */ }
  sendPlayerSnapshot() { /* standalone authority is simulated by GameScene */ }
  requestShove() { /* standalone authority is simulated by GameScene */ }
  requestRocketFire() { /* standalone authority is simulated by GameScene */ }
  requestRocketHit() { /* standalone authority is simulated by GameScene */ }
  requestPlayerElimination() { /* standalone authority is simulated by GameScene */ }
  completeQuestion() { /* standalone authority is simulated by GameScene */ }

  subscribe(listener: GameTransportListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: Parameters<GameTransportListener>[0]) {
    this.listeners.forEach((listener) => listener(event));
  }
}
