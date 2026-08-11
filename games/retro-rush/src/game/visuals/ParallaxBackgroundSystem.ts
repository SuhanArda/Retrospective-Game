import type Phaser from 'phaser';
import { forestPalette, parallaxLayers, skyBackgroundConfig, treeLayerConfig } from './visualConfig';

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
    graphics.fillStyle(forestPalette.mist, skyBackgroundConfig.mist.alpha).fillRect(0, skyBackgroundConfig.mist.y, TEXTURE_WIDTH, skyBackgroundConfig.mist.height);
    [...skyBackgroundConfig.upperClouds, ...skyBackgroundConfig.midClouds].forEach((cloud) => this.drawCloud(graphics, cloud));
    graphics.generateTexture('forest-sky', TEXTURE_WIDTH, TEXTURE_HEIGHT).clear();

    this.drawTreeLayer(graphics, forestPalette.farTrees, treeLayerConfig.far);
    graphics.generateTexture('forest-far', TEXTURE_WIDTH, TEXTURE_HEIGHT).clear();
    this.drawTreeLayer(graphics, forestPalette.midTrees, treeLayerConfig.mid);
    graphics.generateTexture('forest-mid', TEXTURE_WIDTH, TEXTURE_HEIGHT).clear();
    this.drawTreeLayer(graphics, forestPalette.nearTrees, treeLayerConfig.near);
    graphics.fillStyle(0x493a35, 0.32).fillRect(0, 650, TEXTURE_WIDTH, 70);
    graphics.generateTexture('forest-near', TEXTURE_WIDTH, TEXTURE_HEIGHT).clear();
    graphics.destroy();
  }

  private drawCloud(graphics: Phaser.GameObjects.Graphics, cloud: { x: number; y: number; scale: number }) {
    const { x, y, scale } = cloud;
    graphics
      .fillStyle(0xe5d3c5, skyBackgroundConfig.cloudAlpha)
      .fillEllipse(x, y, 126 * scale, 28 * scale)
      .fillEllipse(x - 32 * scale, y - 8 * scale, 62 * scale, 26 * scale)
      .fillEllipse(x + 24 * scale, y - 10 * scale, 76 * scale, 32 * scale)
      .fillEllipse(x + 50 * scale, y - 3 * scale, 54 * scale, 22 * scale);
  }

  private drawTreeLayer(graphics: Phaser.GameObjects.Graphics, color: number, config: (typeof treeLayerConfig)[keyof typeof treeLayerConfig]) {
    const { baseline, spacing, xOffset, canopyScale, alpha } = config;
    for (let x = -30 + xOffset; x < TEXTURE_WIDTH + 60; x += spacing) {
      const height = 220 + (x * 7 % 100);
      graphics.fillStyle(color, alpha).fillRect(x + 25, baseline + 430 - height, 22, height);
      graphics.fillCircle(x + 36, baseline + 430 - height, 76 * canopyScale).fillCircle(x, baseline + 470 - height, 55 * canopyScale).fillCircle(x + 76, baseline + 465 - height, 62 * canopyScale);
      graphics.fillTriangle(x + 25, baseline + 520 - height, x - 28, baseline + 575 - height, x + 28, baseline + 535 - height);
    }
  }
}
