import Phaser from 'phaser';
import type { GameEventBridge } from '../bridge/GameEventBridge';
import type { GameTransport } from '../networking/GameTransport';
import { GameScene } from './scenes/GameScene';
import { gameplayConfig } from '../data/gameplayConfig';

export function createPhaserGame(parent: HTMLElement, bridge: GameEventBridge, transport: GameTransport) {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: 1280,
    height: 720,
    backgroundColor: '#100d25',
    pixelArt: true,
    physics: { default: 'arcade', arcade: { gravity: { x: 0, y: gameplayConfig.player.gravity }, debug: false } },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [new GameScene(bridge, transport)],
    render: { antialias: false, roundPixels: true },
  });
}
