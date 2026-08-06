import type Phaser from 'phaser';

type CharacterPose = 'idle' | 'run' | 'jump' | 'fall';

export class CharacterVisualController {
  createTextures(scene: Phaser.Scene) {
    if (scene.textures.exists('runner-0-idle')) return;
    const colors = [0xd69a52, 0x6f9271, 0xa86662, 0x777398];
    colors.forEach((color, skin) => (['idle', 'run', 'jump', 'fall'] as const).forEach((pose) => this.createTexture(scene, skin, color, pose)));
  }

  update(sprite: Phaser.Physics.Arcade.Sprite, skin: number, velocityX: number, velocityY: number, grounded: boolean) {
    const pose: CharacterPose = !grounded ? velocityY < 0 ? 'jump' : 'fall' : Math.abs(velocityX) > 30 ? 'run' : 'idle';
    sprite.setTexture(`runner-${skin}-${pose}`);
  }

  private createTexture(scene: Phaser.Scene, skin: number, color: number, pose: CharacterPose) {
    const graphics = scene.add.graphics();
    const bob = pose === 'run' ? 1 : 0;
    graphics.fillStyle(0x3a2930).fillRect(12, 5 + bob, 24, 6).fillRect(8, 11 + bob, 31, 10);
    graphics.fillStyle(color).fillRect(11, 12 + bob, 26, 15).fillRect(9, 24 + bob, 30, 18);
    graphics.fillStyle(0xe4b987).fillRect(16, 14 + bob, 16, 11);
    graphics.fillStyle(0x30262b).fillRect(18, 18 + bob, 3, 3).fillRect(28, 18 + bob, 3, 3);
    graphics.fillStyle(0x594038).fillRect(7, 27 + bob, 6, 14).fillRect(37, 27 + bob, 5, 14);
    graphics.fillStyle(0x31282b);
    if (pose === 'run') graphics.fillRect(12, 42, 10, 7).fillRect(30, 39, 9, 7);
    else if (pose === 'jump') graphics.fillRect(11, 41, 10, 7).fillRect(30, 41, 10, 7);
    else if (pose === 'fall') graphics.fillRect(13, 40, 8, 9).fillRect(29, 40, 8, 9);
    else graphics.fillRect(13, 41, 9, 8).fillRect(28, 41, 9, 8);
    graphics.fillStyle(0xd8b15c).fillRect(37, 12, 4, 18);
    graphics.generateTexture(`runner-${skin}-${pose}`, 48, 52).destroy();
  }
}
