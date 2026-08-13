import { useEffect, useRef } from 'react';
import type Phaser from 'phaser';
import type { GameEventBridge } from '../bridge/GameEventBridge';
import type { GameTransport } from '../networking/GameTransport';
import { createPhaserGame } from './PhaserGame';
import type { RetroQuestion } from '../domain/types';
import { retroQuestions } from '../data/retroQuestions';

interface Props { bridge: GameEventBridge; transport: GameTransport; questions?: readonly RetroQuestion[] }

export function GameCanvas({ bridge, transport, questions = retroQuestions }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!hostRef.current || gameRef.current) return;
    gameRef.current = createPhaserGame(hostRef.current, bridge, transport, questions);
    return () => { gameRef.current?.destroy(true); gameRef.current = null; };
  }, [bridge, transport, questions]);

  return <div ref={hostRef} className="game-canvas" aria-label="Retro Rush oyun dünyası" />;
}
