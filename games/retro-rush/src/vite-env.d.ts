/// <reference types="vite/client" />

interface Window {
  __RETRO_RUSH_DEBUG__?: {
    state(): {
      mode: 'standalone' | 'online';
      localPlayerId?: string;
      gameSessionId?: string;
      roundId: number;
      mapSeed: number | null;
      matchState: string;
      cameraScrollX: number;
      players: Array<{ id: string; isLocal: boolean; state: string; x: number; y: number; velocityX: number; velocityY: number; visible: boolean; active: boolean; bodyEnabled: boolean }>;
      networkSnapshotsSent: number;
      networkSnapshotsReceived: number;
      chunks: Array<{ id: string; templateId: string; platforms: Array<{ x: number; y: number; width: number; height: number }> }>;
      pickups: Array<{ id: string; ability: 'speed' | 'rocket' | 'ask'; active: boolean; x: number; y: number }>;
      ownedAbilities: readonly ('speed' | 'rocket' | 'ask')[];
      rockets: Array<{ id: string; ownerId: string; targetId: string }>;
    };
    setLocalPosition(x: number, y: number): void;
    shove(): void;
    useAbility(abilityId: 'speed' | 'rocket' | 'ask'): void;
    setMoveDirection(direction: -1 | 0 | 1): void;
    jump(): void;
    generateThrough(x: number): void;
    disconnect(): void;
    reconnect(): void;
  };
}
