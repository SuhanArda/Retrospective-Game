import Phaser from 'phaser';
import { RouletteScene } from './scenes/RouletteScene';
import type { RouletteRoomBridge } from '../app/roomBridge';
import type { RouletteSeat } from '../app/seats';

export function createPhaserGame(
  parent: HTMLElement,
  bridge: RouletteRoomBridge | null,
  opponents: readonly RouletteSeat[] | null,
  localPlayerId: string | null,
  youSprite: string | null,
) {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: 960,
    height: 640,
    backgroundColor: '#160b0c',
    scene: [new RouletteScene(bridge, opponents, localPlayerId, youSprite)],
    // Sprites are small, hand-pixeled art now — antialiasing/mipmapping would
    // blur them when scaled up. pixelArt keeps every scaled edge crisp.
    pixelArt: true,
    render: { antialias: false, roundPixels: true, preserveDrawingBuffer: true },
  });
}
