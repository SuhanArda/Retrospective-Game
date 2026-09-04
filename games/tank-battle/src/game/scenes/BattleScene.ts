import Phaser from 'phaser';
import type { TankBattleGameSnapshot, TankBattlePlayerSnapshot, TankBattleShotSnapshot } from '@retro-platform/contracts';
import type { GameEventBridge } from '../../bridge/GameEventBridge';
import type { GameTransport } from '../../networking/GameTransport';
import { gameplayConfig } from '../../data/gameplayConfig';
import { computeAim, previewTrajectory, type TankFacing } from '../../domain/aiming';
import { createProjectileLaunch, projectilePositionAt } from '../../domain/ProjectileMotion';
import { planProjectileVisualSync } from '../../domain/ProjectileVisualSync';
import { ServerClock } from '../../domain/ServerClock';
import {
  advanceTankPosition,
  createSmoothedTankPosition,
  retargetTankPosition,
  type SmoothedTankPosition,
} from '../../domain/TankMotionSmoother';
import { terrainAt } from '../../domain/terrain';
import {
  calculateCameraTargetX,
  calculateViewportCoverage,
  type ViewportCoverage,
} from '../../domain/ViewportCoverage';
import { LatestSnapshotGate } from '../LatestSnapshotGate';
import { pagePointerToWorld } from '../PointerCoordinates';

const TEAM_COLORS = {
  RED: { bright: 0xff6670, body: 0xd94755, dark: 0x722c39, glow: 0xffa0a6 },
  BLUE: { bright: 0x55b7ff, body: 0x327fca, dark: 0x234b78, glow: 0xa8dcff },
} as const;
const VIEWPORT_BLEED = 48;
const CAMERA_FOLLOW_SMOOTH_MS = 180;

export class BattleScene extends Phaser.Scene {
  private backgroundGraphics!: Phaser.GameObjects.Graphics;
  private waterGraphics!: Phaser.GameObjects.Graphics;
  private terrainGraphics!: Phaser.GameObjects.Graphics;
  private tankGraphics!: Phaser.GameObjects.Graphics;
  private aimGraphics!: Phaser.GameObjects.Graphics;
  private snapshot: TankBattleGameSnapshot | null = null;
  private angle = 42;
  private power = 340;
  private aimPointerPage: { x: number; y: number } | null = null;
  private lastMoveAt = 0;
  private lastWaterFrameAt = 0;
  private localFacingOverride: TankFacing | null = null;
  private disposeTransport: (() => void) | null = null;
  private disposePointerInput: (() => void) | null = null;
  private readonly labels = new Map<string, Phaser.GameObjects.Text>();
  private readonly tankPositions = new Map<string, SmoothedTankPosition>();
  private readonly shotVisuals = new Map<string, {
    projectile: Phaser.GameObjects.Rectangle;
    glow: Phaser.GameObjects.Rectangle;
    shot: TankBattleShotSnapshot;
    lastTrailAt: number;
  }>();
  private readonly serverClock = new ServerClock();
  private keys: Record<'left' | 'right', Phaser.Input.Keyboard.Key> | null = null;
  private reducedMotion = false;
  private readonly snapshotGate = new LatestSnapshotGate<TankBattleGameSnapshot>((snapshot) => this.acceptSnapshot(snapshot));

  constructor(private readonly bridge: GameEventBridge, private readonly transport: GameTransport) { super('battle'); }

  init(): void {
    this.stopSnapshotDelivery();
    this.snapshotGate.start();
    this.disposeTransport = this.transport.subscribe((event) => {
      if (event.type === 'snapshot') this.snapshotGate.receive(event.snapshot);
      if (event.type === 'error') this.bridge.emit('announcement', event.message);
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.stopSnapshotDelivery, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.stopSnapshotDelivery, this);
  }

  create(): void {
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.backgroundGraphics = this.add.graphics().setDepth(0);
    this.waterGraphics = this.add.graphics().setDepth(3);
    this.terrainGraphics = this.add.graphics().setDepth(2);
    this.tankGraphics = this.add.graphics().setDepth(4);
    this.aimGraphics = this.add.graphics().setDepth(7);
    this.refreshViewportCoverage();
    this.createAmbientPixels();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleViewportResize, this);
    const keyboard = this.input.keyboard;
    if (keyboard) {
      this.keys = {
        left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      };
      keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT).on('down', () => this.move(-1));
      keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT).on('down', () => this.move(1));
    }
    const disposeAim = this.bridge.on('aimPointerMoved', ({ pageX, pageY }) => this.handleAim(pageX, pageY));
    const disposeFire = this.bridge.on('firePointerPressed', ({ pageX, pageY }) => this.handleFire(pageX, pageY));
    this.disposePointerInput = () => { disposeAim(); disposeFire(); };
    this.snapshotGate.markReady();
    this.cameras.main.fadeIn(450, 8, 14, 27);
  }

  update(time: number, delta: number): void {
    this.updateProjectileVisuals(time);
    if (this.snapshot && this.advanceTankPositions(delta)) this.renderTanks(this.snapshot, false);
    this.updateCamera(delta);
    this.refreshAimFromPointer();
    if (this.snapshot && time - this.lastWaterFrameAt > 90) {
      this.renderWater(this.snapshot, Math.floor(time / 90));
      this.lastWaterFrameAt = time;
    }
    if (!this.snapshot || this.snapshot.phase !== 'RUNNING' || time - this.lastMoveAt < gameplayConfig.input.moveRepeatMs) return;
    if (this.keys?.left.isDown) this.move(-1, time);
    else if (this.keys?.right.isDown) this.move(1, time);
  }

  private move(direction: -1 | 1, time = this.time.now): void {
    if (this.snapshot?.phase !== 'RUNNING' || !this.localTank()?.alive || time - this.lastMoveAt < gameplayConfig.input.moveRepeatMs) return;
    this.localFacingOverride = direction < 0 ? 'LEFT' : 'RIGHT';
    this.previewLocalMove(direction);
    this.transport.move(direction);
    this.lastMoveAt = time;
    this.renderTanks(this.snapshot, false);
  }

  private acceptSnapshot(snapshot: TankBattleGameSnapshot): void {
    this.serverClock.observe(snapshot.serverTimeUnixMs);
    const previous = this.snapshot;
    const resetView = !previous || previous.roundNumber !== snapshot.roundNumber || previous.mapWidth !== snapshot.mapWidth;
    this.syncTankPositions(snapshot, resetView);
    this.snapshot = snapshot;
    this.refreshViewportCoverage();
    const local = this.localTank();
    if (local && local.facing === this.localFacingOverride) this.localFacingOverride = null;
    this.renderTanks(snapshot);
    this.showDamageFeedback(previous, snapshot);
    this.showLandingFeedback(previous, snapshot);
    this.updateCamera(0, resetView);
    this.bridge.emit('snapshot', snapshot);
    this.syncProjectileVisuals(snapshot.projectiles);
  }

  private stopSnapshotDelivery(): void {
    this.snapshotGate.stop();
    this.disposeTransport?.();
    this.disposeTransport = null;
    this.disposePointerInput?.();
    this.disposePointerInput = null;
    this.events.off(Phaser.Scenes.Events.SHUTDOWN, this.stopSnapshotDelivery, this);
    this.events.off(Phaser.Scenes.Events.DESTROY, this.stopSnapshotDelivery, this);
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleViewportResize, this);
    this.labels.forEach((label) => label.destroy());
    this.labels.clear();
    this.tankPositions.clear();
    this.shotVisuals.forEach(({ projectile, glow }) => {
      projectile.destroy();
      glow.destroy();
    });
    this.shotVisuals.clear();
  }

  private refreshViewportCoverage(): void {
    const mapWidth = this.snapshot?.mapWidth ?? gameplayConfig.viewport.width;
    const mapHeight = this.snapshot?.mapHeight ?? gameplayConfig.viewport.height;
    const coverage = this.currentViewportCoverage({ mapWidth, mapHeight });
    this.cameras.main.setBounds(coverage.left, coverage.top, coverage.width, coverage.height);
    if (!this.snapshot) this.cameras.main.centerOn(mapWidth / 2, mapHeight / 2);
    this.renderBackground(coverage);
    if (this.snapshot) {
      this.renderTerrain(this.snapshot, coverage);
      this.renderWater(this.snapshot, Math.floor(this.time.now / 90), coverage);
    }
  }

  private handleViewportResize(): void {
    this.refreshViewportCoverage();
    this.updateCamera(0, true);
    this.refreshAimFromPointer();
  }

  private updateCamera(deltaMs: number, snap = false): void {
    const snapshot = this.snapshot;
    const local = this.localTank();
    if (!snapshot || !local) return;
    const camera = this.cameras.main;
    const rendered = this.renderedTank(local);
    const targetX = calculateCameraTargetX(rendered.x, camera.width, snapshot.mapWidth);
    const targetY = snapshot.mapHeight / 2;
    if (snap || deltaMs <= 0) {
      camera.centerOn(targetX, targetY);
      return;
    }
    const amount = 1 - Math.exp(-deltaMs / CAMERA_FOLLOW_SMOOTH_MS);
    camera.centerOn(
      Phaser.Math.Linear(camera.midPoint.x, targetX, amount),
      Phaser.Math.Linear(camera.midPoint.y, targetY, amount),
    );
  }

  private currentViewportCoverage(dimensions: Pick<TankBattleGameSnapshot, 'mapWidth' | 'mapHeight'>): ViewportCoverage {
    return calculateViewportCoverage(
      this.cameras.main.width,
      this.cameras.main.height,
      dimensions.mapWidth,
      dimensions.mapHeight,
      VIEWPORT_BLEED,
    );
  }

  private renderBackground(coverage: ViewportCoverage): void {
    const graphics = this.backgroundGraphics.clear();
    const mapWidth = this.snapshot?.mapWidth ?? gameplayConfig.viewport.width;
    const sunX = Math.round(mapWidth * 0.78);
    graphics.fillGradientStyle(0x111a31, 0x111a31, 0x314d68, 0x314d68, 1)
      .fillRect(coverage.left, coverage.top, coverage.width, coverage.height);
    graphics.fillStyle(0xffd36a, 0.14).fillRect(sunX - 17, 92, 112, 112);
    graphics.fillStyle(0xffe49a, 0.8).fillRect(sunX, 109, 78, 78);
    graphics.fillStyle(0xfff1bc, 0.5).fillRect(sunX + 15, 124, 48, 48);
    graphics.fillStyle(0x425c79, 0.55);
    for (let x = coverage.left - 80; x < coverage.right + 100; x += 150)
      graphics.fillTriangle(x, 425, x + 95, 205 + (x % 300) * 0.1, x + 210, 425);
    graphics.fillStyle(0x263d58, 0.9);
    for (let x = coverage.left - 100; x < coverage.right + 100; x += 190)
      graphics.fillTriangle(x, 500, x + 125, 285 + (x % 380) * 0.08, x + 270, 500);
    graphics.fillStyle(0xd9e9e5, 0.22);
    this.drawPixelCloud(graphics, mapWidth * 0.1, 105, 1);
    this.drawPixelCloud(graphics, mapWidth * 0.41, 155, 0.72);
    this.drawPixelCloud(graphics, mapWidth * 0.82, 245, 0.55);
    graphics.fillStyle(0xffffff, 0.35);
    const stars: ReadonlyArray<readonly [number, number]> = [
      [mapWidth * 0.08, 62], [mapWidth * 0.23, 133], [mapWidth * 0.35, 78],
      [mapWidth * 0.6, 112], [mapWidth * 0.74, 73], [mapWidth * 0.92, 154],
    ];
    for (const [x, y] of stars) graphics.fillRect(x, y, 3, 3);
  }

  private drawPixelCloud(graphics: Phaser.GameObjects.Graphics, x: number, y: number, scale: number): void {
    graphics.fillRect(x, y + 14 * scale, 92 * scale, 18 * scale);
    graphics.fillRect(x + 18 * scale, y, 42 * scale, 30 * scale);
    graphics.fillRect(x + 57 * scale, y + 8 * scale, 24 * scale, 22 * scale);
  }

  private createAmbientPixels(): void {
    const moteCount = Math.ceil(gameplayConfig.viewport.width / 57);
    for (let index = 0; index < moteCount; index++) {
      const mote = this.add.rectangle(30 + index * 57, 170 + (index * 83) % 300, 3, 3, 0xffe8a1, 0.2).setDepth(1);
      this.tweens.add({
        targets: mote, x: mote.x + 24, y: mote.y - 28, alpha: 0.65, yoyo: true, repeat: -1,
        duration: 1800 + index * 90, delay: index * 70,
      });
    }
  }

  private renderWater(
    snapshot: TankBattleGameSnapshot,
    frame: number,
    coverage = this.currentViewportCoverage(snapshot),
  ): void {
    const graphics = this.waterGraphics.clear();
    graphics.fillGradientStyle(0x2e718e, 0x2e718e, 0x163c5a, 0x163c5a, 1)
      .fillRect(coverage.left, snapshot.waterY, coverage.width, coverage.bottom - snapshot.waterY);
    graphics.fillStyle(0x9ae5df, 0.42).fillRect(coverage.left, snapshot.waterY, coverage.width, 4);
    graphics.fillStyle(0x72d2dc, 0.82);
    for (let x = coverage.left - 32; x < coverage.right + 32; x += 48) {
      const offset = (frame + Math.floor(x / 48)) % 2 === 0 ? 0 : 5;
      graphics.fillRect(x + offset, snapshot.waterY + 7, 29, 4);
    }
    graphics.fillStyle(0x4ba0b8, 0.7);
    for (let x = coverage.left + 12; x < coverage.right; x += 76)
      graphics.fillRect(x - (frame % 4) * 4, snapshot.waterY + 27 + (x % 3) * 9, 42, 3);
    graphics.fillStyle(0x102d48, 0.55).fillRect(coverage.left, coverage.bottom - 8, coverage.width, 8);
  }

  private renderTerrain(snapshot: TankBattleGameSnapshot, coverage = this.currentViewportCoverage(snapshot)): void {
    const graphics = this.terrainGraphics.clear();
    this.fillTerrainPolygon(graphics, snapshot, coverage, 0x382b32, 0);
    this.fillTerrainPolygon(graphics, snapshot, coverage, 0x5a4035, 10);
    graphics.lineStyle(10, 0x283a2d, 1); this.strokeTerrain(graphics, snapshot, coverage, 5);
    graphics.lineStyle(5, 0x81924b, 1); this.strokeTerrain(graphics, snapshot, coverage, 0);
    for (let index = 4; index < snapshot.terrainHeights.length - 2; index += 5) {
      const x = index * snapshot.terrainStep;
      const surface = snapshot.terrainHeights[index] ?? snapshot.waterY;
      const variant = Math.abs((index * 31 + snapshot.mapSeed) % 7);
      if (variant <= 2 && surface + 28 < snapshot.waterY) {
        graphics.fillStyle(variant === 0 ? 0x2b2429 : 0x7a5942, 0.7);
        graphics.fillRect(x, surface + 18 + variant * 7, 5 + variant * 2, 4 + variant);
      }
      if (variant === 6 && surface < snapshot.waterY - 35) {
        graphics.fillStyle(0x53673b).fillRect(x, surface - 10, 3, 10);
        graphics.fillStyle(0x8c9b50).fillRect(x - 4, surface - 12, 10, 4);
      }
    }
  }

  private fillTerrainPolygon(
    graphics: Phaser.GameObjects.Graphics,
    snapshot: TankBattleGameSnapshot,
    coverage: ViewportCoverage,
    color: number,
    offset: number,
  ): void {
    const firstHeight = (snapshot.terrainHeights[0] ?? snapshot.waterY) + offset;
    const lastHeight = (snapshot.terrainHeights.at(-1) ?? snapshot.waterY) + offset;
    graphics.fillStyle(color);
    graphics.beginPath().moveTo(coverage.left, firstHeight).lineTo(0, firstHeight);
    snapshot.terrainHeights.forEach((height, index) => graphics.lineTo(index * snapshot.terrainStep, height + offset));
    graphics.lineTo(snapshot.mapWidth, lastHeight).lineTo(coverage.right, lastHeight)
      .lineTo(coverage.right, coverage.bottom).lineTo(coverage.left, coverage.bottom).closePath().fillPath();
  }

  private strokeTerrain(
    graphics: Phaser.GameObjects.Graphics,
    snapshot: TankBattleGameSnapshot,
    coverage: ViewportCoverage,
    offset: number,
  ): void {
    const firstHeight = (snapshot.terrainHeights[0] ?? snapshot.waterY) + offset;
    const lastHeight = (snapshot.terrainHeights.at(-1) ?? snapshot.waterY) + offset;
    graphics.beginPath().moveTo(coverage.left, firstHeight).lineTo(0, firstHeight);
    snapshot.terrainHeights.forEach((height, index) => graphics.lineTo(index * snapshot.terrainStep, height + offset));
    graphics.lineTo(snapshot.mapWidth, lastHeight).lineTo(coverage.right, lastHeight);
    graphics.strokePath();
  }

  private renderTanks(snapshot: TankBattleGameSnapshot, refreshLabels = true): void {
    this.tankGraphics.clear();
    if (refreshLabels) this.syncTankLabels(snapshot);
    snapshot.players.forEach((tank) => this.drawTank(this.renderedTank(tank)));
    this.positionTankLabels(snapshot);
    this.drawAim();
  }

  private drawTank(tank: TankBattlePlayerSnapshot): void {
    const graphics = this.tankGraphics;
    const palette = TEAM_COLORS[tank.team];
    const facing = this.effectiveFacing(tank);
    const direction = facing === 'RIGHT' ? 1 : -1;
    const isLocal = tank.playerId === this.transport.localPlayerId;
    if (isLocal && tank.alive) {
      graphics.fillStyle(palette.glow, 0.16).fillRect(tank.x - 27, tank.y - 35, 54, 52);
      graphics.lineStyle(2, 0xffed9b, 0.85).strokeRect(tank.x - 24, tank.y - 32, 48, 48);
    }
    graphics.fillStyle(0x0a0e16, 0.45).fillEllipse(tank.x, tank.y + 11, 50, 10);
    if (!tank.alive) {
      graphics.fillStyle(0x161920).fillRect(tank.x - 20, tank.y - 3, 40, 11);
      graphics.fillStyle(0x5b4140).fillRect(tank.x - 12, tank.y - 11, 24, 9);
      graphics.fillStyle(0xf19b45).fillRect(tank.x - 7, tank.y - 23, 6, 8).fillRect(tank.x + 2, tank.y - 29, 7, 12);
      graphics.fillStyle(0x30343f, 0.8).fillRect(tank.x - 3, tank.y - 41, 7, 7);
      return;
    }
    graphics.fillStyle(0x11151e).fillRect(tank.x - 22, tank.y + 1, 44, 11);
    graphics.fillStyle(0x39404b).fillRect(tank.x - 18, tank.y + 4, 36, 5);
    for (let wheel = -14; wheel <= 14; wheel += 7) graphics.fillStyle(0x11151e).fillRect(tank.x + wheel - 2, tank.y + 3, 5, 5);
    graphics.fillStyle(palette.dark).fillRect(tank.x - 18, tank.y - 8, 36, 12);
    graphics.fillStyle(palette.body).fillRect(tank.x - 14, tank.y - 13, 28, 9);
    graphics.fillStyle(palette.bright).fillRect(tank.x - 8, tank.y - 19, 17, 9);
    graphics.fillStyle(0xffdf8d, 0.7).fillRect(tank.x - 5, tank.y - 17, 6, 3);
    graphics.fillStyle(palette.dark).fillRect(tank.x - direction * 13, tank.y - 6, 7, 5);
    const displayedAngle = isLocal && this.snapshot?.phase === 'RUNNING' ? this.angle : tank.turretAngle;
    const radians = displayedAngle * Math.PI / 180;
    const pivotX = tank.x + direction * 2;
    const pivotY = tank.y - 15;
    const barrelX = pivotX + Math.cos(radians) * 28 * direction;
    const barrelY = pivotY - Math.sin(radians) * 28;
    graphics.lineStyle(8, palette.dark).lineBetween(pivotX, pivotY, barrelX, barrelY);
    graphics.lineStyle(4, palette.bright).lineBetween(pivotX, pivotY - 1, barrelX, barrelY - 1);
    graphics.fillStyle(0x121722).fillRect(barrelX - 3, barrelY - 3, 7, 7);
    graphics.lineStyle(2, palette.glow, 0.9).lineBetween(tank.x - direction * 4, tank.y - 20, tank.x - direction * 4, tank.y - 34);
    graphics.fillStyle(palette.bright).fillTriangle(tank.x - direction * 4, tank.y - 34, tank.x - direction * 4, tank.y - 27, tank.x - direction * 14, tank.y - 31);
    for (let health = 0; health < 3; health++) {
      graphics.fillStyle(health < tank.health ? 0xffdb67 : 0x303744, health < tank.health ? 1 : 0.8)
        .fillRect(tank.x - 16 + health * 12, tank.y - 43, 9, 5);
      if (health < tank.health) graphics.fillStyle(0xfff1a6).fillRect(tank.x - 15 + health * 12, tank.y - 42, 5, 2);
    }
    if (!tank.connected) graphics.lineStyle(2, 0xffffff, 0.5).strokeRect(tank.x - 25, tank.y - 47, 50, 62);
  }

  private createTankLabel(tank: TankBattlePlayerSnapshot, badge: string): Phaser.GameObjects.Text {
    const rendered = this.renderedTank(tank);
    const label = this.add.text(rendered.x, rendered.y - 63, `${tank.displayName} · ${badge}`, {
      align: 'center', color: tank.team === 'RED' ? '#ffb0b4' : '#a8ddff', fontFamily: 'Courier New, monospace',
      fontSize: '10px', fontStyle: 'bold', backgroundColor: '#0b111dcc', padding: { x: 5, y: 3 },
    }).setOrigin(0.5, 1).setDepth(6).setResolution(2);
    label.setShadow(2, 2, '#000000', 0, false, true);
    return label;
  }

  private handleAim(pageX: number, pageY: number): void {
    this.aimPointerPage = { x: pageX, y: pageY };
    this.refreshAimFromPointer();
  }

  private refreshAimFromPointer(): void {
    if (!this.aimPointerPage) return;
    const authoritativeLocal = this.localTank();
    const local = authoritativeLocal ? this.renderedTank(authoritativeLocal) : undefined;
    if (!local?.alive || this.snapshot?.phase !== 'RUNNING') return;
    const pointer = pagePointerToWorld(this.aimPointerPage.x, this.aimPointerPage.y, this.scale, this.cameras.main);
    const aim = computeAim(local.x, local.y, pointer.x, pointer.y, this.effectiveFacing(local));
    if (aim.angle === this.angle && aim.power === this.power) return;
    this.angle = aim.angle;
    this.power = aim.power;
    this.bridge.emit('aimChanged', aim);
    if (this.snapshot) this.renderTanks(this.snapshot, false);
  }

  private drawAim(): void {
    const authoritativeLocal = this.localTank();
    const local = authoritativeLocal ? this.renderedTank(authoritativeLocal) : undefined;
    this.aimGraphics.clear();
    if (!local?.alive || this.snapshot?.phase !== 'RUNNING') return;
    const points = previewTrajectory(local.x, local.y, this.effectiveFacing(local), this.angle, this.power);
    points.forEach((point, index) => {
      const size = index < 4 ? 5 : Math.max(2, 5 - Math.floor(index / 4));
      this.aimGraphics.fillStyle(index % 2 === 0 ? 0xfff0a6 : 0xffc857, Math.max(0.25, 0.9 - index * 0.045));
      this.aimGraphics.fillRect(point.x - size / 2, point.y - size / 2, size, size);
    });
    const target = points.at(-1);
    if (target) {
      this.aimGraphics.lineStyle(2, 0xffd86f, 0.65).strokeRect(target.x - 7, target.y - 7, 14, 14);
      this.aimGraphics.lineBetween(target.x - 11, target.y, target.x + 11, target.y);
      this.aimGraphics.lineBetween(target.x, target.y - 11, target.x, target.y + 11);
    }
  }

  private handleFire(pageX: number, pageY: number): void {
    this.handleAim(pageX, pageY);
    if (!this.localTank()?.alive || this.snapshot?.phase !== 'RUNNING') return;
    const local = this.localTank();
    if (local) {
      const rendered = this.renderedTank(local);
      const launch = createProjectileLaunch(rendered.x, rendered.y, this.effectiveFacing(local), this.angle, this.power);
      this.showMuzzleFlash(launch.launch.x, launch.launch.y, Math.atan2(launch.velocity.y, launch.velocity.x));
      this.transport.fire(this.angle, this.power, this.effectiveFacing(local));
    }
  }

  private showDamageFeedback(previous: TankBattleGameSnapshot | null, next: TankBattleGameSnapshot): void {
    if (!previous || previous.roundNumber !== next.roundNumber) return;
    for (const tank of next.players) {
      const oldTank = previous.players.find((candidate) => candidate.playerId === tank.playerId);
      if (!oldTank || tank.health >= oldTank.health) continue;
      const damage = this.add.text(tank.x, tank.y - 70, `-${oldTank.health - tank.health}`, {
        color: '#fff0a5', fontFamily: 'Courier New, monospace', fontSize: '20px', fontStyle: 'bold',
        stroke: '#8d2733', strokeThickness: 4,
      }).setOrigin(0.5).setDepth(40);
      this.tweens.add({ targets: damage, y: damage.y - 34, alpha: 0, duration: 780, onComplete: () => damage.destroy() });
      this.cameras.main.shake(tank.alive ? 100 : 190, tank.alive ? 0.003 : 0.009);
    }
  }

  private showLandingFeedback(previous: TankBattleGameSnapshot | null, next: TankBattleGameSnapshot): void {
    if (!previous || previous.roundNumber !== next.roundNumber) return;
    for (const tank of next.players) {
      const oldTank = previous.players.find((candidate) => candidate.playerId === tank.playerId);
      if (!oldTank?.airborne || tank.airborne || !tank.alive) continue;
      for (let index = 0; index < 7; index++) {
        const dust = this.add.rectangle(tank.x, tank.y + 8, 5, 4, index % 2 ? 0x8d7654 : 0x63734a, 0.7).setDepth(8);
        this.tweens.add({
          targets: dust,
          x: tank.x + (index - 3) * 9,
          y: tank.y - 4 - index % 3 * 3,
          alpha: 0,
          duration: 220 + index * 20,
          onComplete: () => dust.destroy(),
        });
      }
    }
  }

  private syncProjectileVisuals(shots: readonly TankBattleShotSnapshot[]): void {
    const plan = planProjectileVisualSync(new Set(this.shotVisuals.keys()), shots);
    plan.create.forEach((shot) => this.createShotVisual(shot));
    plan.update.forEach((shot) => {
      const visual = this.shotVisuals.get(shot.shotId);
      if (visual) visual.shot = shot;
    });
    plan.finish.forEach((shot) => this.finishShotVisual(shot));
    plan.remove.forEach((shotId) => this.removeShotVisual(shotId));
  }

  private createShotVisual(shot: TankBattleShotSnapshot): void {
    const serverNow = this.serverClock.now();
    const point = projectilePositionAt(shot, serverNow);
    const glow = this.add.rectangle(point.x, point.y, 16, 10, 0xff9f43, 0.28)
      .setRotation(point.angleRadians).setDepth(29);
    const projectile = this.add.rectangle(point.x, point.y, 11, 5, 0xfff2ad)
      .setStrokeStyle(2, 0x5b2d2a, 1).setRotation(point.angleRadians).setDepth(30);
    this.shotVisuals.set(shot.shotId, { projectile, glow, shot, lastTrailAt: -Infinity });
    if (shot.ownerPlayerId !== this.transport.localPlayerId && serverNow - shot.firedAtUnixMs < 250) {
      this.showMuzzleFlash(shot.launch.x, shot.launch.y, Math.atan2(shot.velocity.y, shot.velocity.x));
    }
  }

  private updateProjectileVisuals(time: number): void {
    const serverNow = this.serverClock.now();
    this.shotVisuals.forEach((visual) => {
      const point = projectilePositionAt(visual.shot, serverNow);
      visual.projectile.setPosition(point.x, point.y).setRotation(point.angleRadians);
      visual.glow.setPosition(point.x, point.y).setRotation(point.angleRadians);
      const waitingTooLong = point.reachedImpact && serverNow - visual.shot.impactAtUnixMs > 100;
      visual.projectile.setVisible(!waitingTooLong);
      visual.glow.setVisible(!waitingTooLong);
      if (point.reachedImpact || this.reducedMotion || time - visual.lastTrailAt < 55) return;
      visual.lastTrailAt = time;
      const trail = this.add.rectangle(point.x, point.y, 6, 4, 0xffb84d, 0.72).setDepth(28);
      this.tweens.add({
        targets: trail,
        alpha: 0,
        scaleX: 0.25,
        scaleY: 0.25,
        duration: 170,
        onComplete: () => trail.destroy(),
      });
    });
  }

  private finishShotVisual(shot: TankBattleShotSnapshot): void {
    this.removeShotVisual(shot.shotId);
    if (shot.status === 'IMPACTED') this.explode(shot.impact.x, shot.impact.y);
    else if (shot.impactType === 'WATER') this.splash(shot.impact.x, shot.impact.y);
  }

  private removeShotVisual(shotId: string): void {
    const visual = this.shotVisuals.get(shotId);
    if (visual) {
      visual.projectile.destroy();
      visual.glow.destroy();
      this.shotVisuals.delete(shotId);
    }
  }

  private showMuzzleFlash(x: number, y: number, angleRadians: number): void {
    const flash = this.add.rectangle(x, y, 16, 8, 0xfff0a3, 0.95)
      .setRotation(angleRadians).setDepth(31);
    const ember = this.add.rectangle(x, y, 7, 7, 0xff8e3c, 0.9).setDepth(30);
    this.tweens.add({
      targets: [flash, ember],
      scaleX: 1.8,
      scaleY: 0.35,
      alpha: 0,
      duration: this.reducedMotion ? 70 : 130,
      onComplete: () => { flash.destroy(); ember.destroy(); },
    });
  }

  private splash(x: number, y: number): void {
    for (let index = 0; index < 9; index++) {
      const drop = this.add.rectangle(x, y, 5, 5, index % 2 ? 0x9ae5df : 0x55b7d1, 0.85).setDepth(32);
      const direction = index - 4;
      this.tweens.add({
        targets: drop,
        x: x + direction * 8,
        y: y - 18 - (4 - Math.abs(direction)) * 4,
        alpha: 0,
        duration: 260 + index * 15,
        ease: 'Quad.out',
        onComplete: () => drop.destroy(),
      });
    }
  }

  private explode(x: number, y: number): void {
    this.cameras.main.shake(220, 0.01);
    this.cameras.main.flash(90, 255, 216, 107, false);
    const ring = this.add.rectangle(x, y, 18, 18).setStrokeStyle(4, 0xffd56b, 1).setDepth(32);
    this.tweens.add({ targets: ring, scale: 4.5, alpha: 0, duration: 330, onComplete: () => ring.destroy() });
    const colors = [0xfff2a1, 0xffc14f, 0xf27545, 0x9d3c3c, 0x3a3034];
    for (let index = 0; index < 24; index++) {
      const radians = index / 24 * Math.PI * 2;
      const distance = 24 + (index % 5) * 7;
      const particle = this.add.rectangle(x, y, 5 + index % 3 * 2, 5 + index % 2 * 3, colors[index % colors.length]!).setDepth(33);
      this.tweens.add({
        targets: particle, x: x + Math.cos(radians) * distance, y: y + Math.sin(radians) * distance + 18,
        alpha: 0, angle: index % 2 ? 90 : -90, duration: 280 + (index % 4) * 55, ease: 'Quad.out',
        onComplete: () => particle.destroy(),
      });
    }
  }

  private syncTankPositions(snapshot: TankBattleGameSnapshot, snap: boolean): void {
    const currentPlayers = new Set(snapshot.players.map((tank) => tank.playerId));
    this.tankPositions.forEach((_, playerId) => {
      if (!currentPlayers.has(playerId)) this.tankPositions.delete(playerId);
    });
    snapshot.players.forEach((tank) => {
      const position = this.tankPositions.get(tank.playerId);
      if (position) retargetTankPosition(position, tank.x, tank.y, snap || this.reducedMotion);
      else this.tankPositions.set(tank.playerId, createSmoothedTankPosition(tank.x, tank.y));
    });
  }

  private advanceTankPositions(delta: number): boolean {
    if (this.reducedMotion) return false;
    let moved = false;
    this.tankPositions.forEach((position) => {
      moved = advanceTankPosition(
        position,
        delta,
        gameplayConfig.movement.smoothTimeMs,
        gameplayConfig.movement.maxFrameMs,
      ) || moved;
    });
    return moved;
  }

  private previewLocalMove(direction: -1 | 1): void {
    const snapshot = this.snapshot;
    const local = this.localTank();
    if (!snapshot || !local || local.airborne) return;
    const position = this.tankPositions.get(local.playerId);
    if (!position) return;
    const predictedX = position.targetX + direction * gameplayConfig.input.authoritativeStep;
    const predictionMin = Math.max(36, local.x - gameplayConfig.input.maxPredictionLead);
    const predictionMax = Math.min(snapshot.mapWidth - 36, local.x + gameplayConfig.input.maxPredictionLead);
    const targetX = Phaser.Math.Clamp(predictedX, predictionMin, predictionMax);
    retargetTankPosition(position, targetX, terrainAt(snapshot, targetX) - 12, this.reducedMotion);
  }

  private renderedTank(tank: TankBattlePlayerSnapshot): TankBattlePlayerSnapshot {
    const position = this.tankPositions.get(tank.playerId);
    return position ? { ...tank, x: position.x, y: position.y } : tank;
  }

  private syncTankLabels(snapshot: TankBattleGameSnapshot): void {
    const currentPlayers = new Set(snapshot.players.map((tank) => tank.playerId));
    this.labels.forEach((label, playerId) => {
      if (!currentPlayers.has(playerId)) {
        label.destroy();
        this.labels.delete(playerId);
      }
    });
    snapshot.players.forEach((tank) => {
      const badge = this.tankBadge(tank);
      const label = this.labels.get(tank.playerId) ?? this.createTankLabel(tank, badge);
      label.setText(`${tank.displayName} · ${badge}`);
      this.labels.set(tank.playerId, label);
    });
  }

  private positionTankLabels(snapshot: TankBattleGameSnapshot): void {
    snapshot.players.forEach((tank) => {
      const rendered = this.renderedTank(tank);
      this.labels.get(tank.playerId)?.setPosition(rendered.x, rendered.y - 63);
    });
  }

  private tankBadge(tank: TankBattlePlayerSnapshot): string {
    if (!tank.alive) return 'ELENDİ';
    if (tank.playerId === this.transport.localPlayerId) return 'SEN';
    return tank.team === 'RED' ? 'KIRMIZI' : 'MAVİ';
  }

  private effectiveFacing(tank: TankBattlePlayerSnapshot): TankFacing {
    return tank.playerId === this.transport.localPlayerId && this.localFacingOverride ? this.localFacingOverride : tank.facing;
  }

  private localTank(): TankBattlePlayerSnapshot | undefined {
    return this.snapshot?.players.find((tank) => tank.playerId === this.transport.localPlayerId);
  }
}
