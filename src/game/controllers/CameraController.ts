import type Phaser from 'phaser';
import { gameplayConfig } from '../../data/gameplayConfig';

export class CameraController {
  private speed = gameplayConfig.camera.baseSpeed;
  private running = false;

  start() { this.running = true; }
  stop() { this.running = false; }
  reset(camera: Phaser.Cameras.Scene2D.Camera) { this.speed = gameplayConfig.camera.baseSpeed; camera.scrollX = 0; }

  update(camera: Phaser.Cameras.Scene2D.Camera, deltaMs: number, worldWidth: number) {
    if (!this.running) return;
    this.speed = Math.min(gameplayConfig.camera.maxSpeed, this.speed + gameplayConfig.camera.acceleration * deltaMs / 1000);
    camera.scrollX = Math.min(worldWidth - camera.width, camera.scrollX + this.speed * deltaMs / 1000);
  }

  dangerX(camera: Phaser.Cameras.Scene2D.Camera) { return camera.scrollX + gameplayConfig.camera.dangerOffset; }
}
