import type Phaser from 'phaser';
import { forestPalette, parallaxLayers } from './visualConfig';

const TEXTURE_WIDTH = 640;
const TEXTURE_HEIGHT = 720;

export class ParallaxBackgroundSystem {
  private layers: Array<{ sprite: Phaser.GameObjects.TileSprite; factor: number }> = [];

  create(scene: Phaser.Scene) {
    this.createTextures(scene);
    this.layers = parallaxLayers.map((layer) => ({
      factor: layer.factor,
      sprite: scene.add.tileSprite(0, 0, scene.scale.width, scene.scale.height, layer.key).setOrigin(0).setScrollFactor(0).setDepth(layer.depth),
    }));
  }

  update(cameraX: number) {
    this.layers.forEach(({ sprite, factor }) => { sprite.tilePositionX = cameraX * factor; });
  }

  private createTextures(scene: Phaser.Scene) {
    if (scene.textures.exists('forest-sky')) return;
    const graphics = scene.add.graphics();
    graphics.fillStyle(forestPalette.sky).fillRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);
    graphics.fillStyle(forestPalette.mist, 0.45).fillRect(0, 310, TEXTURE_WIDTH, 410);
    for (let x = 20; x < TEXTURE_WIDTH; x += 96) graphics.fillStyle(0xe5d3c5, 0.3).fillEllipse(x, 250 + x % 70, 150, 34);
    graphics.generateTexture('forest-sky', TEXTURE_WIDTH, TEXTURE_HEIGHT).clear();

    this.drawTreeLayer(graphics, forestPalette.farTrees, 230, 95, 0.62);
    graphics.generateTexture('forest-far', TEXTURE_WIDTH, TEXTURE_HEIGHT).clear();
    this.drawTreeLayer(graphics, forestPalette.midTrees, 150, 78, 0.82);
    graphics.generateTexture('forest-mid', TEXTURE_WIDTH, TEXTURE_HEIGHT).clear();
    this.drawTreeLayer(graphics, forestPalette.nearTrees, 80, 64, 0.94);
    graphics.fillStyle(0x493a35, 0.32).fillRect(0, 650, TEXTURE_WIDTH, 70);
    graphics.generateTexture('forest-near', TEXTURE_WIDTH, TEXTURE_HEIGHT).clear();
    graphics.destroy();
  }

  private drawTreeLayer(graphics: Phaser.GameObjects.Graphics, color: number, baseline: number, spacing: number, alpha: number) {
    for (let x = -30; x < TEXTURE_WIDTH + 60; x += spacing) {
      const height = 220 + (x * 7 % 100);
      graphics.fillStyle(color, alpha).fillRect(x + 25, baseline + 430 - height, 22, height);
      graphics.fillCircle(x + 36, baseline + 430 - height, 76).fillCircle(x, baseline + 470 - height, 55).fillCircle(x + 76, baseline + 465 - height, 62);
      graphics.fillTriangle(x + 25, baseline + 520 - height, x - 28, baseline + 575 - height, x + 28, baseline + 535 - height);
    }
  }
}
