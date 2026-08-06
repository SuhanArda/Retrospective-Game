import { useEffect, useRef } from 'react';
import type Phaser from 'phaser';
import type { GameEventBridge } from '../bridge/GameEventBridge';
import type { GameTransport } from '../networking/GameTransport';
import { createPhaserGame } from './PhaserGame';

interface Props { bridge: GameEventBridge; transport: GameTransport }

export function GameCanvas({ bridge, transport }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!hostRef.current || gameRef.current) return;
    gameRef.current = createPhaserGame(hostRef.current, bridge, transport);
    return () => { gameRef.current?.destroy(true); gameRef.current = null; };
  }, [bridge, transport]);

  return <div ref={hostRef} className="game-canvas" aria-label="Retro Rush game world" />;
}
