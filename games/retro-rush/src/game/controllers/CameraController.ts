import type Phaser from 'phaser';
import { gameplayConfig } from '../../data/gameplayConfig';
import type { PlayerState } from '../../domain/types';

export interface CameraPlayerSnapshot {
  x: number;
  state: PlayerState;
}

export interface CameraUpdateInput {
  currentX: number;
  deltaMs: number;
  viewportWidth: number;
  worldWidth: number;
  players: readonly CameraPlayerSnapshot[];
}

const LEADER_STATES: ReadonlySet<PlayerState> = new Set(['ACTIVE', 'INVULNERABLE', 'RESPAWNING']);
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

export function findLeadingEligiblePlayer(players: readonly CameraPlayerSnapshot[]) {
  return players.reduce<CameraPlayerSnapshot | undefined>((leader, player) =>
    LEADER_STATES.has(player.state) && (!leader || player.x > leader.x) ? player : leader, undefined);
}

export function calculateNextCameraX(input: CameraUpdateInput) {
  const maximumX = Math.max(0, input.worldWidth - input.viewportWidth);
  const currentX = clamp(input.currentX, 0, maximumX);
  const leader = findLeadingEligiblePlayer(input.players);
  if (!leader || input.deltaMs <= 0) return currentX;

  const deltaSeconds = input.deltaMs / 1000;
  const desiredX = leader.x - input.viewportWidth * gameplayConfig.camera.leaderScreenRatio;
  const targetX = Math.max(currentX, desiredX);
  const smoothing = 1 - Math.exp(-gameplayConfig.camera.followSharpness * deltaSeconds);
  const desiredMovement = (targetX - currentX) * smoothing;
  const maximumMovement = gameplayConfig.camera.maximumCatchUpSpeed * deltaSeconds;
  return clamp(currentX + clamp(desiredMovement, 0, maximumMovement), 0, maximumX);
}

export function calculateEliminationBoundary(cameraX: number) {
  return cameraX + gameplayConfig.camera.leftDangerMargin;
}

export class CameraController {
  private running = false;

  start() { this.running = true; }
  stop() { this.running = false; }
  reset(camera: Phaser.Cameras.Scene2D.Camera) { this.running = false; camera.scrollX = 0; }

  update(camera: Phaser.Cameras.Scene2D.Camera, deltaMs: number, worldWidth: number, players: readonly CameraPlayerSnapshot[]) {
    if (!this.running) return camera.scrollX;
    camera.scrollX = calculateNextCameraX({ currentX: camera.scrollX, deltaMs, viewportWidth: camera.width, worldWidth, players });
    return camera.scrollX;
  }

  dangerX(camera: Phaser.Cameras.Scene2D.Camera) { return calculateEliminationBoundary(camera.scrollX); }
}
