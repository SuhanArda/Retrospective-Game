import Phaser from 'phaser';
import type { GameEventBridge } from '../bridge/GameEventBridge';
import type { GameTransport } from '../networking/GameTransport';
import { gameplayConfig } from '../data/gameplayConfig';
import { BattleScene } from './scenes/BattleScene';

export function createPhaserGame(parent: HTMLElement, bridge: GameEventBridge, transport: GameTransport): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: gameplayConfig.viewport.width,
    height: gameplayConfig.viewport.height,
    backgroundColor: '#18253c',
    pixelArt: true,
    antialias: false,
    audio: { noAudio: true },
    scale: { mode: Phaser.Scale.EXPAND, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [new BattleScene(bridge, transport)],
  });
}
