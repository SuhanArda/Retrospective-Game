import type Phaser from 'phaser';
import type { Platform } from '../map/mapTypes';
import { forestPalette } from './visualConfig';

export class TerrainRenderer {
  createTexture(scene: Phaser.Scene) {
    if (scene.textures.exists('terrain-forest')) return;
    const graphics = scene.add.graphics();
    graphics.fillStyle(forestPalette.earthDark).fillRect(0, 0, 32, 32);
    graphics.fillStyle(forestPalette.earth).fillRect(2, 7, 28, 23);
    graphics.fillStyle(forestPalette.grass).fillRect(0, 0, 32, 7);
    graphics.fillStyle(forestPalette.grassLight).fillRect(0, 0, 32, 3);
    graphics.fillStyle(forestPalette.stone).fillRect(3, 15, 10, 7).fillRect(17, 11, 12, 8).fillRect(12, 24, 13, 6);
    graphics.fillStyle(0x877873).fillRect(4, 15, 7, 2).fillRect(18, 11, 9, 2);
    graphics.generateTexture('terrain-forest', 32, 32).destroy();
  }

  render(scene: Phaser.Scene, platform: Platform) {
    const visual = scene.add.tileSprite(platform.x, platform.y - platform.height / 2, platform.width, Math.max(24, platform.height), 'terrain-forest').setOrigin(0).setDepth(1);
    scene.add.rectangle(platform.x, platform.y - platform.height / 2, 4, Math.max(24, platform.height), 0x322529).setOrigin(0).setDepth(1.1);
    scene.add.rectangle(platform.x + platform.width - 4, platform.y - platform.height / 2, 4, Math.max(24, platform.height), 0x322529).setOrigin(0).setDepth(1.1);
    return visual;
  }
}
