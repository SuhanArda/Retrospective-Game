import { useEffect, useRef } from 'react';
import type Phaser from 'phaser';
import type { RouletteRoomBridge } from '../app/roomBridge';
import type { RouletteSeat } from '../app/seats';
import { createPhaserGame } from './PhaserGame';

interface Props {
  /** Present only when launched from a real room; null means the local bot demo. */
  bridge: RouletteRoomBridge | null;
  opponents: readonly RouletteSeat[] | null;
  localPlayerId: string | null;
  /** The local player's own sprite, resolved against the same room so it never collides with an opponent's. Null means the local bot demo picks its own. */
  youSprite: string | null;
  /** Mirrored onto Phaser's own SoundManager below — one flag silences every sound the scene plays (ambience, gunshot, miss click) without the scene having to know about it. */
  muted: boolean;
}

/**
 * Read once, when the world is built, and not in the effect's dependencies
 * on purpose: rebuilding the Phaser game mid-round would throw away the
 * table. The caller settles the room before mounting this, same as
 * retro-rush's GameCanvas.
 */
export function GameCanvas({ bridge, opponents, localPlayerId, youSprite, muted }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const propsRef = useRef({ bridge, opponents, localPlayerId, youSprite, muted });
  propsRef.current = { bridge, opponents, localPlayerId, youSprite, muted };

  useEffect(() => {
    if (!hostRef.current) return;
    // React StrictMode (dev only) mounts, cleans up, and remounts this effect
    // back-to-back. Phaser's destroy(true) doesn't guarantee its canvas is
    // gone from the DOM before that remount runs, so without this a second
    // canvas can land right next to the first — clearing the host directly
    // makes the remount safe no matter how destroy() times out.
    hostRef.current.replaceChildren();
    const { bridge: initialBridge, opponents: initialOpponents, localPlayerId: initialLocalPlayerId, youSprite: initialYouSprite, muted: initialMuted } = propsRef.current;
    const game = createPhaserGame(hostRef.current, initialBridge, initialOpponents, initialLocalPlayerId, initialYouSprite);
    game.sound.mute = initialMuted;
    gameRef.current = game;
    return () => {
      game.destroy(true);
      if (gameRef.current === game) gameRef.current = null;
    };
  }, []);

  // The game itself is only ever built once (see above), but the mute
  // toggle has to keep working across the whole session — Phaser's own
  // SoundManager flag covers every sound the scene plays in one place.
  useEffect(() => {
    if (gameRef.current) gameRef.current.sound.mute = muted;
  }, [muted]);

  return <div ref={hostRef} className="table-canvas-host" />;
}
