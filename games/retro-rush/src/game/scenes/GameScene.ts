import Phaser from 'phaser';
import { gameplayConfig } from '../../data/gameplayConfig';
import { retroQuestions } from '../../data/retroQuestions';
import type { AbilityId, MatchSnapshot, PlayerSnapshot, PlayerState, RetroQuestion } from '../../domain/types';
import { transitionPlayer } from '../../domain/types';
import { isBehindCamera, isEligibleTarget } from '../../domain/rules';
import type { GameEventBridge } from '../../bridge/GameEventBridge';
import type { GameTransport } from '../../networking/GameTransport';
import { sampleMap } from '../map/sampleMap';
import { CameraController } from '../controllers/CameraController';
import { AbilityController } from '../controllers/AbilityController';
import { RespawnSystem } from '../systems/RespawnSystem';
import { SeededRandom } from '../../testing/bot/SeededRandom';
import { AudioManager } from '../../audio/AudioManager';
import { calculateHomingVelocity, findNearestRocketTarget, resolveRocketHit, velocityTowards, type PositionedPlayer, type RocketState } from '../controllers/RocketLifecycle';
import { applyJumpCut, clampDeltaSeconds, createJumpState, recordJumpPress, resetJumpState, tryStartJump, updateGroundedState, type JumpState } from '../controllers/PlayerMovementController';
import { collectPickup, type PickupState } from '../systems/PickupSystem';
import { segmentIntersectsExpandedAabb } from '../controllers/RocketCollision';
import { ParallaxBackgroundSystem } from '../visuals/ParallaxBackgroundSystem';
import { TerrainRenderer } from '../visuals/TerrainRenderer';
import { PropPlacementSystem } from '../visuals/PropPlacementSystem';
import { CharacterVisualController } from '../visuals/CharacterVisualController';
import { forestPalette } from '../visuals/visualConfig';
import { beginHitStun, createPlayerHitState, fixedLeftKnockbackVelocity, isInHitStun, resetHitStun, updateHitStun, type PlayerHitState } from '../controllers/PlayerHitState';

interface PlayerRuntime {
  snapshot: PlayerSnapshot;
  sprite: Phaser.Physics.Arcade.Sprite;
  label: Phaser.GameObjects.Text;
  facing: -1 | 1;
  jumpState: JumpState;
  hitState: PlayerHitState;
  invulnerableUntil: number;
  speedUntil: number;
  botJumpAt: number;
}

interface PickupRuntime extends PickupState {
  ability: Extract<AbilityId, 'speed' | 'rocket'>;
  zone: Phaser.GameObjects.Zone;
  visuals: Phaser.GameObjects.GameObject[];
}

export class GameScene extends Phaser.Scene {
  private players: PlayerRuntime[] = [];
  private local!: PlayerRuntime;
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private rockets!: Phaser.Physics.Arcade.Group;
  private readonly rocketsToDispose = new Set<Phaser.Physics.Arcade.Sprite>();
  private pickups: PickupRuntime[] = [];
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<'a' | 'd' | 'w' | 'one' | 'two' | 'three', Phaser.Input.Keyboard.Key>;
  private readonly cameraController = new CameraController();
  private readonly abilityController = new AbilityController();
  private readonly respawnSystem = new RespawnSystem(sampleMap.checkpoints);
  private readonly random = new SeededRandom(20260806);
  private readonly audio = new AudioManager();
  private readonly background = new ParallaxBackgroundSystem();
  private readonly terrainRenderer = new TerrainRenderer();
  private readonly propPlacement = new PropPlacementSystem();
  private readonly characterVisuals = new CharacterVisualController();
  private matchState: MatchSnapshot['state'] = 'WAITING';
  private countdown = 3;
  private elapsedMs = 0;
  private lastSnapshotAt = 0;
  private questionIndex = 0;
  private finishCount = 0;
  private targetProtectedUntil: Record<string, number> = {};
  private inputSequence = 0;
  private unsubscribers: Array<() => void> = [];

  constructor(private readonly bridge: GameEventBridge, private readonly transport: GameTransport) {
    super({ key: 'GameScene' });
  }

  create() {
    this.matchState = 'WAITING';
    this.countdown = 3;
    this.elapsedMs = 0;
    this.finishCount = 0;
    this.targetProtectedUntil = {};
    this.inputSequence = 0;
    this.abilityController.reset();
    this.cameraController.reset(this.cameras.main);
    this.physics.world.setBounds(0, 0, sampleMap.width, sampleMap.height);
    this.cameras.main.setBounds(0, 0, sampleMap.width, sampleMap.height);
    this.cameras.main.setBackgroundColor('#b8a6bd');
    this.createTextures();
    this.createBackdrop();
    this.createLevel();
    this.propPlacement.render(this);
    this.createPlayers();
    this.createInputs();
    this.bindBridge();
    this.publishSnapshot(true);
  }

  update(time: number, delta: number) {
    this.flushRocketDisposals();
    this.background.update(this.cameras.main.scrollX);
    if (this.matchState === 'COUNTDOWN') return;
    if (this.matchState !== 'RUNNING') { this.updateLabels(); return; }
    this.elapsedMs += delta;
    this.cameraController.update(this.cameras.main, delta, sampleMap.width, this.players.map((player) => ({ x: player.sprite.x, state: player.snapshot.state })));
    this.updateLocal(time, delta);
    this.updateBots(time);
    this.updateRockets(delta);
    this.updatePlayers(time);
    this.checkFinitePhysicsValues();
    this.updateLabels();
    if (this.elapsedMs >= gameplayConfig.world.matchDurationMs) this.finishMatch();
    this.publishSnapshot(time - this.lastSnapshotAt > 150);
  }

  private bindBridge() {
    this.unsubscribers.push(
      this.bridge.on('startMatch', () => this.startCountdown()),
      this.bridge.on('restartMatch', () => this.scene.restart()),
      this.bridge.on('answerSubmitted', ({ question, value, skipped }) => this.handleAnswer(question, value, skipped)),
      this.bridge.on('abilityRequested', ({ abilityId }) => this.useAbility(abilityId)),
      this.bridge.on('targetSelected', ({ playerId }) => this.chooseTarget(playerId)),
      this.bridge.on('audioMuted', ({ muted }) => this.audio.setMuted(muted)),
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.players.forEach((player) => resetHitStun(player.hitState));
      this.unsubscribers.splice(0).forEach((unsubscribe) => unsubscribe());
    });
  }

  private createTextures() {
    const graphics = this.add.graphics();
    graphics.fillStyle(0xffffff).fillRoundedRect(0, 0, 64, 32, 8).generateTexture('platform', 64, 32).clear();
    graphics.fillStyle(forestPalette.lantern).fillRect(3, 5, 18, 7).fillStyle(0x744335).fillRect(0, 7, 24, 4).fillStyle(0xe5c17b).fillRect(5, 4, 12, 3).generateTexture('rocket', 24, 16).clear();
    graphics.destroy();
    this.characterVisuals.createTextures(this);
    this.terrainRenderer.createTexture(this);
  }

  private createBackdrop() {
    this.background.create(this);
  }

  private createLevel() {
    this.platforms = this.physics.add.staticGroup();
    sampleMap.platforms.forEach((platform) => {
      const body = this.platforms.create(platform.x + platform.width / 2, platform.y, 'platform') as Phaser.Physics.Arcade.Sprite;
      body.setDisplaySize(platform.width, platform.height).refreshBody().setVisible(false);
      this.terrainRenderer.render(this, platform);
    });
    sampleMap.checkpoints.slice(1).forEach((checkpoint) => {
      this.add.rectangle(checkpoint.x, checkpoint.y + 25, 7, 110, 0x4b342e).setOrigin(0.5, 1).setDepth(2);
      this.add.rectangle(checkpoint.x, checkpoint.y - 82, 20, 22, forestPalette.lantern, 0.9).setDepth(2);
      this.add.circle(checkpoint.x, checkpoint.y - 71, 34, forestPalette.lantern, 0.09).setDepth(1.9);
      this.add.text(checkpoint.x + 15, checkpoint.y - 91, checkpoint.label.toUpperCase(), { fontFamily: 'monospace', fontSize: '12px', color: '#f1d7a4', stroke: '#33262a', strokeThickness: 4 }).setDepth(3);
    });
    this.pickups = sampleMap.pickups.map((pickup) => {
      const color = pickup.ability === 'speed' ? 0xc98b55 : forestPalette.lantern;
      const circle = this.add.circle(pickup.x, pickup.y, 18, color, 0.3).setStrokeStyle(3, color).setDepth(5);
      const glow = this.add.circle(pickup.x, pickup.y, 30, color, 0.08).setDepth(4.9);
      const icon = this.add.text(pickup.x, pickup.y, pickup.ability === 'speed' ? '»' : '➜', { fontFamily: 'monospace', fontSize: '20px', color: '#fff0c9' }).setOrigin(0.5).setDepth(5.1);
      const zone = this.add.zone(pickup.x, pickup.y, 50, 50);
      this.physics.add.existing(zone, true);
      return { active: true, ability: pickup.ability, zone, visuals: [circle, glow, icon] };
    });
    const finish = sampleMap.finish;
    this.add.rectangle(finish.x, finish.y + finish.height / 2, finish.width, finish.height, 0x4d332e, 0.92).setDepth(2);
    this.add.rectangle(finish.x, finish.y, 58, 12, forestPalette.lantern).setDepth(2.1);
    this.add.text(finish.x - 74, finish.y - 38, 'FOREST LODGE', { fontFamily: 'monospace', fontSize: '17px', color: '#f2cf8b', fontStyle: 'bold', stroke: '#33262a', strokeThickness: 4 }).setDepth(3);
    this.rockets = this.physics.add.group({ allowGravity: false });
    this.physics.add.collider(this.rockets, this.platforms, (rocket) => this.resolveRocket(rocket as Phaser.Physics.Arcade.Sprite, 'EXPIRED'));
  }

  private createPlayers() {
    const definitions = [
      { id: 'local', name: 'Local Player', color: 0xffd166, icon: '◆' },
      { id: 'ada', name: 'Ada', color: 0x66e3c4, icon: '▲' },
      { id: 'mert', name: 'Mert', color: 0xff7da8, icon: '●' },
      { id: 'ece', name: 'Ece', color: 0x8db6ff, icon: '■' },
    ];
    this.players = definitions.map((definition, index) => {
      const sprite = this.physics.add.sprite(sampleMap.spawn.x - index * 46, sampleMap.spawn.y, `runner-${index}-idle`);
      sprite.setCollideWorldBounds(false).setDepth(4);
      sprite.body?.setSize(27, 39).setOffset(8, 10);
      this.physics.add.collider(sprite, this.platforms);
      const label = this.add.text(sprite.x, sprite.y - 45, `${definition.icon} ${definition.name}`, { fontFamily: 'monospace', fontSize: '12px', color: '#fff0ce', stroke: '#2c2227', strokeThickness: 4 }).setOrigin(0.5).setDepth(6);
      return {
        snapshot: { ...definition, state: 'ACTIVE' as PlayerState, isLocal: index === 0, checkpointId: 'start', eliminations: 0, answers: 0 },
        sprite, label, facing: 1 as const, jumpState: createJumpState(), hitState: createPlayerHitState(), invulnerableUntil: 0, speedUntil: 0, botJumpAt: 0,
      };
    });
    this.local = this.players[0]!;
    for (const player of this.players) {
      this.physics.add.overlap(this.rockets, player.sprite, (rocket) => this.hitByRocket(rocket as Phaser.Physics.Arcade.Sprite, player));
      for (const pickup of this.pickups) this.physics.add.overlap(player.sprite, pickup.zone, () => this.tryCollectPickup(player, pickup));
    }
  }

  private createInputs() {
    if (!this.input.keyboard) throw new Error('Keyboard input is unavailable');
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys({ a: 'A', d: 'D', w: 'W', one: 'ONE', two: 'TWO', three: 'THREE' }) as typeof this.keys;
  }

  private startCountdown() {
    if (this.matchState !== 'WAITING') return;
    this.matchState = 'COUNTDOWN';
    this.countdown = 3;
    this.publishSnapshot(true);
    const text = this.add.text(this.cameras.main.centerX, 250, '3', { fontFamily: 'monospace', fontSize: '96px', color: '#ffd166', stroke: '#100d25', strokeThickness: 10 }).setOrigin(0.5).setScrollFactor(0).setDepth(20);
    this.time.addEvent({ delay: 1000, repeat: 2, callback: () => {
      this.countdown -= 1;
      text.setText(this.countdown > 0 ? String(this.countdown) : 'GO!');
      this.publishSnapshot(true);
      if (this.countdown === 0) {
        this.time.delayedCall(450, () => text.destroy());
        this.matchState = 'RUNNING'; this.cameraController.start(); this.publishSnapshot(true);
      }
    }});
  }

  private updateLocal(time: number, delta: number) {
    const player = this.local;
    if (player.snapshot.state !== 'ACTIVE' && player.snapshot.state !== 'INVULNERABLE') { player.sprite.setVelocityX(0); return; }
    const body = player.sprite.body as Phaser.Physics.Arcade.Body;
    const grounded = updateGroundedState(player.jumpState, time, body.blocked.down, body.touching.down);
    const left = this.cursors.left.isDown || this.keys.a.isDown;
    const right = this.cursors.right.isDown || this.keys.d.isDown;
    const jumpDown = Phaser.Input.Keyboard.JustDown(this.cursors.up) || Phaser.Input.Keyboard.JustDown(this.cursors.space) || Phaser.Input.Keyboard.JustDown(this.keys.w);
    if (jumpDown) recordJumpPress(player.jumpState, time);
    const jumpReleased = Phaser.Input.Keyboard.JustUp(this.cursors.up) || Phaser.Input.Keyboard.JustUp(this.cursors.space) || Phaser.Input.Keyboard.JustUp(this.keys.w);
    const direction = Number(right) - Number(left);
    const speedMultiplier = time < player.speedUntil ? 1.5 : 1;
    const hitStunned = isInHitStun(player.hitState, time);
    if (hitStunned) {
      player.sprite.setAccelerationX(0);
    } else {
      if (direction !== 0) {
        player.facing = direction as -1 | 1;
        const airControl = grounded ? 1 : gameplayConfig.player.airborneControlMultiplier;
        player.sprite.setAccelerationX(direction * gameplayConfig.player.acceleration * speedMultiplier * airControl);
        player.sprite.setFlipX(direction < 0);
      } else {
        player.sprite.setAccelerationX(0);
        const speed = Math.max(0, Math.abs(body.velocity.x) - gameplayConfig.player.deceleration * clampDeltaSeconds(delta, gameplayConfig.player.maximumDeltaSeconds));
        player.sprite.setVelocityX(Math.sign(body.velocity.x) * speed);
      }
    }
    const maximumHorizontalSpeed = hitStunned ? Math.max(gameplayConfig.rocket.rocketKnockbackX, gameplayConfig.player.maxRunSpeed * speedMultiplier) : gameplayConfig.player.maxRunSpeed * speedMultiplier;
    player.sprite.setMaxVelocity(maximumHorizontalSpeed, gameplayConfig.player.maximumFallSpeed);
    if (tryStartJump(player.jumpState, time, grounded, gameplayConfig.player.coyoteTimeMs, gameplayConfig.player.jumpBufferMs)) {
      player.sprite.setVelocityY(-gameplayConfig.player.jumpVelocity); this.audio.play('jump');
    }
    const cutVelocity = applyJumpCut(player.jumpState, body.velocity.y, jumpReleased, gameplayConfig.player.jumpCutMultiplier);
    if (cutVelocity !== body.velocity.y) player.sprite.setVelocityY(cutVelocity);
    if (Phaser.Input.Keyboard.JustDown(this.keys.one)) this.useAbility('speed');
    if (Phaser.Input.Keyboard.JustDown(this.keys.two)) this.useAbility('rocket');
    if (Phaser.Input.Keyboard.JustDown(this.keys.three)) this.useAbility('ask');
    this.transport.sendPlayerInput({ sequence: ++this.inputSequence, left: hitStunned ? false : left, right: hitStunned ? false : right, jump: jumpDown, sentAt: Date.now() });
  }

  private updateBots(time: number) {
    for (const bot of this.players.slice(1)) {
      if (bot.snapshot.state !== 'ACTIVE' && bot.snapshot.state !== 'INVULNERABLE') continue;
      const hitStunned = isInHitStun(bot.hitState, time);
      bot.sprite.setAccelerationX(hitStunned ? 0 : 880);
      bot.sprite.setMaxVelocity(hitStunned ? Math.max(gameplayConfig.rocket.rocketKnockbackX, 220 + (bot.snapshot.name.length * 11)) : 220 + (bot.snapshot.name.length * 11), gameplayConfig.player.maximumFallSpeed);
      const body = bot.sprite.body as Phaser.Physics.Arcade.Body;
      if ((body.blocked.right || this.gapAhead(bot.sprite.x)) && body.blocked.down && time > bot.botJumpAt) {
        bot.sprite.setVelocityY(-gameplayConfig.player.jumpVelocity);
        bot.botJumpAt = time + 600;
      }
      if (this.random.next() < 0.0009) bot.sprite.setVelocityY(-180);
    }
  }

  private gapAhead(x: number) {
    return !sampleMap.platforms.some((platform) => x + 55 >= platform.x && x + 55 <= platform.x + platform.width && platform.y >= 600);
  }

  private updatePlayers(time: number) {
    for (const player of this.players) {
      const hadHitStun = Number.isFinite(player.hitState.hitStunEndsAt);
      if (!updateHitStun(player.hitState, time) && hadHitStun && player.sprite.active) player.sprite.clearTint();
      if (player.snapshot.state === 'INVULNERABLE' && time >= player.invulnerableUntil) {
        this.setPlayerState(player, 'ACTIVE'); player.sprite.clearTint().setAlpha(1);
      } else if (player.snapshot.state === 'INVULNERABLE') player.sprite.setAlpha(Math.floor(time / 100) % 2 ? 0.4 : 1);
      if (player.snapshot.state !== 'ACTIVE') continue;
      const passed = [...sampleMap.checkpoints].reverse().find((checkpoint) => player.sprite.x >= checkpoint.x);
      if (passed && passed.id !== player.snapshot.checkpointId) {
        player.snapshot = { ...player.snapshot, checkpointId: passed.id };
        if (player.snapshot.isLocal) { this.audio.play('checkpoint'); this.bridge.emit('announcement', `Checkpoint reached: ${passed.label}`); }
      }
      const body = player.sprite.body as Phaser.Physics.Arcade.Body;
      if (player.sprite.y > sampleMap.height + 40 || isBehindCamera(body.right, this.cameraController.dangerX(this.cameras.main))) this.eliminate(player);
      if (player.sprite.x >= sampleMap.finish.x && player.snapshot.state === 'ACTIVE') this.finishPlayer(player);
    }
  }

  private eliminate(player: PlayerRuntime) {
    resetHitStun(player.hitState);
    player.snapshot = { ...player.snapshot, state: transitionPlayer(player.snapshot.state, 'FALLEN'), eliminations: player.snapshot.eliminations + 1 };
    player.sprite.disableBody(true, true); player.label.setVisible(false);
    if (player.snapshot.isLocal) {
      this.setPlayerState(player, 'ANSWERING_QUESTION');
      this.bridge.emit('questionOpened', retroQuestions[this.questionIndex++ % retroQuestions.length]!);
      this.bridge.emit('announcement', 'Share a reflection to rejoin');
    } else {
      this.setPlayerState(player, 'ANSWERING_QUESTION');
      this.time.delayedCall(gameplayConfig.bot.answerDelayMs + this.random.next() * 900, () => { this.setPlayerState(player, 'RESPAWNING'); this.respawn(player); });
    }
    this.publishSnapshot(true);
  }

  private handleAnswer(question: RetroQuestion, value: string, skipped: boolean) {
    if (this.local.snapshot.state !== 'ANSWERING_QUESTION') return;
    this.transport.submitRetroAnswer({ questionId: question.id, value, skipped, clientTime: Date.now() });
    this.local.snapshot = { ...this.local.snapshot, answers: this.local.snapshot.answers + (skipped ? 0 : 1), state: transitionPlayer(this.local.snapshot.state, 'RESPAWNING') };
    if (!skipped) this.bridge.emit('answerCollected', { questionId: question.id, value, answeredAt: Date.now() });
    this.time.delayedCall(gameplayConfig.player.respawnDelayMs, () => this.respawn(this.local));
  }

  private respawn(player: PlayerRuntime) {
    const point = this.respawnSystem.select(player.snapshot.checkpointId, this.cameraController.dangerX(this.cameras.main));
    player.snapshot = { ...player.snapshot, state: transitionPlayer(player.snapshot.state, 'INVULNERABLE'), checkpointId: point.id };
    player.sprite.enableBody(true, point.x, point.y, true, true).setVelocity(0, 0).setTint(0xffffff).setAlpha(0.7);
    resetJumpState(player.jumpState);
    resetHitStun(player.hitState);
    player.label.setVisible(true); player.invulnerableUntil = this.time.now + gameplayConfig.player.invulnerabilityMs;
    if (player.snapshot.isLocal) { this.audio.play('respawn'); this.bridge.emit('announcement', 'Ready to continue'); }
    this.publishSnapshot(true);
  }

  private useAbility(id: AbilityId) {
    if (this.matchState !== 'RUNNING' || !['ACTIVE', 'INVULNERABLE'].includes(this.local.snapshot.state)) return;
    const now = this.time.now;
    if (!this.abilityController.isReady(id, now)) { this.bridge.emit('announcement', 'That ability is still recharging'); return; }
    const rocketTarget = id === 'rocket' ? this.findRocketTarget(this.local) : undefined;
    if (id === 'rocket' && !rocketTarget) { this.bridge.emit('announcement', 'No eligible target nearby'); return; }
    if (!this.abilityController.tryUse(id, now)) return;
    this.transport.useAbility({ abilityId: id, direction: this.local.facing, clientTime: Date.now() });
    this.audio.play('ability');
    if (id === 'speed') { this.local.speedUntil = now + 3_000; this.local.sprite.setTint(0xfff1a8); }
    if (id === 'rocket' && rocketTarget) this.fireRocket(this.local, rocketTarget);
    if (id === 'ask') this.bridge.emit('targetSelectionOpened', { protectedTargets: this.targetProtectedUntil });
    this.publishSnapshot(true);
  }

  private fireRocket(owner: PlayerRuntime, target: PlayerRuntime) {
    const rocket = this.rockets.create(owner.sprite.x + owner.facing * 35, owner.sprite.y, 'rocket') as Phaser.Physics.Arcade.Sprite;
    const velocity = velocityTowards(rocket, target.sprite, gameplayConfig.rocket.speed, owner.facing);
    rocket.setData('ownerId', owner.snapshot.id).setData('targetId', target.snapshot.id).setData('state', 'ACTIVE' satisfies RocketState).setData('previousX', rocket.x).setData('previousY', rocket.y).setVelocity(velocity.x, velocity.y).setFlipX(velocity.x < 0);
    const body = rocket.body as Phaser.Physics.Arcade.Body;
    body.setSize(gameplayConfig.rocket.collisionWidth, gameplayConfig.rocket.collisionHeight, false).setOffset(gameplayConfig.rocket.collisionOffsetX, gameplayConfig.rocket.collisionOffsetY);
    this.audio.play('rocket');
    this.showRocketWarning(target);
    this.time.delayedCall(gameplayConfig.rocket.lifetimeMs, () => this.resolveRocket(rocket, 'EXPIRED'));
  }

  private positionedPlayer(player: PlayerRuntime): PositionedPlayer { return { id: player.snapshot.id, state: player.snapshot.state, x: player.sprite.x, y: player.sprite.y }; }

  private findRocketTarget(owner: PlayerRuntime, origin = this.positionedPlayer(owner)) {
    const target = findNearestRocketTarget(origin, this.players.map((player) => this.positionedPlayer(player)), gameplayConfig.rocket);
    return target ? this.players.find((player) => player.snapshot.id === target.id) : undefined;
  }

  private updateRockets(deltaMs: number) {
    const deltaSeconds = clampDeltaSeconds(deltaMs, gameplayConfig.player.maximumDeltaSeconds);
    for (const child of this.rockets.getChildren()) {
      const rocket = child as Phaser.Physics.Arcade.Sprite;
      if (!rocket.active || rocket.getData('state') !== 'ACTIVE') continue;
      this.resolveSweptRocketHit(rocket);
      if (rocket.getData('state') !== 'ACTIVE') continue;
      const ownerId = String(rocket.getData('ownerId'));
      let target = this.players.find((player) => player.snapshot.id === rocket.getData('targetId'));
      const origin: PositionedPlayer = { id: ownerId, state: 'ACTIVE', x: rocket.x, y: rocket.y };
      if (!target || !findNearestRocketTarget(origin, [this.positionedPlayer(target)], gameplayConfig.rocket)) {
        target = gameplayConfig.rocket.targetReacquireEnabled ? this.findRocketTarget(this.players.find((player) => player.snapshot.id === ownerId) ?? this.local, origin) : undefined;
        rocket.setData('targetId', target?.snapshot.id ?? '');
        if (target) this.showRocketWarning(target);
      }
      if (!target) continue;
      const body = rocket.body as Phaser.Physics.Arcade.Body | null;
      if (!body?.enable) continue;
      const velocity = calculateHomingVelocity(body.velocity, rocket, target.sprite, gameplayConfig.rocket.speed, gameplayConfig.rocket.homingTurnRateRadiansPerSecond, deltaSeconds);
      rocket.setVelocity(velocity.x, velocity.y).setRotation(Math.atan2(velocity.y, velocity.x)).setFlipY(velocity.x < 0);
      rocket.setData('previousX', rocket.x).setData('previousY', rocket.y);
    }
  }

  private resolveSweptRocketHit(rocket: Phaser.Physics.Arcade.Sprite) {
    if (!gameplayConfig.rocket.sweptCollisionEnabled) return;
    const start = { x: Number(rocket.getData('previousX')), y: Number(rocket.getData('previousY')) };
    const end = { x: rocket.x, y: rocket.y };
    if (![start.x, start.y, end.x, end.y].every(Number.isFinite)) return;
    for (const player of this.players) {
      const body = player.sprite.body as Phaser.Physics.Arcade.Body | null;
      if (!body || !segmentIntersectsExpandedAabb(start, end, body, gameplayConfig.rocket.collisionRadius)) continue;
      this.hitByRocket(rocket, player);
      if (rocket.getData('state') !== 'ACTIVE') return;
    }
  }

  private showRocketWarning(target: PlayerRuntime) {
    const marker = this.add.text(target.sprite.x, target.sprite.y - 76, '!', { fontFamily: 'monospace', fontSize: '28px', color: '#ff4d6d', stroke: '#100d25', strokeThickness: 5 }).setOrigin(0.5).setDepth(10);
    this.tweens.add({ targets: marker, alpha: 0, y: marker.y - 12, duration: 650, onComplete: () => marker.destroy() });
  }

  private tryCollectPickup(player: PlayerRuntime, pickup: PickupRuntime) {
    if (!player.snapshot.isLocal || player.snapshot.state !== 'ACTIVE' || !collectPickup(pickup)) return;
    const body = pickup.zone.body as Phaser.Physics.Arcade.StaticBody;
    body.enable = false;
    pickup.visuals.forEach((visual) => visual.destroy());
    this.abilityController.grant(pickup.ability);
    if (player.snapshot.isLocal) this.bridge.emit('announcement', `${pickup.ability === 'speed' ? 'Momentum' : 'Nudge rocket'} ready`);
    this.publishSnapshot(true);
  }

  private hitByRocket(rocket: Phaser.Physics.Arcade.Sprite, target: PlayerRuntime) {
    const ownerId = String(rocket.getData('ownerId'));
    const lifecycle = { ownerId, state: (rocket.getData('state') ?? 'DESTROYED') as RocketState };
    if (!rocket.active || !resolveRocketHit(lifecycle, target.snapshot)) return;

    // Resolve and disable before effects: other overlap callbacks can now only ignore this rocket.
    rocket.setData('state', lifecycle.state);
    const rocketBody = rocket.body as Phaser.Physics.Arcade.Body | null;
    rocketBody?.stop();
    rocketBody?.setEnable(false);
    const targetBody = target.sprite.body as Phaser.Physics.Arcade.Body;
    const velocity = fixedLeftKnockbackVelocity(targetBody.velocity.y, gameplayConfig.rocket.rocketKnockbackX);
    target.sprite.setAccelerationX(0).setMaxVelocity(Math.max(gameplayConfig.rocket.rocketKnockbackX, gameplayConfig.player.maxRunSpeed), gameplayConfig.player.maximumFallSpeed).setVelocity(velocity.x, velocity.y).setTint(0xffffff);
    beginHitStun(target.hitState, this.time.now, gameplayConfig.rocket.hitStunMs);
    this.queueRocketDisposal(rocket);
  }

  private resolveRocket(rocket: Phaser.Physics.Arcade.Sprite, state: Extract<RocketState, 'EXPIRED'>) {
    if (!rocket.active || rocket.getData('state') !== 'ACTIVE') return;
    rocket.setData('state', state);
    const body = rocket.body as Phaser.Physics.Arcade.Body | null;
    body?.stop();
    body?.setEnable(false);
    this.queueRocketDisposal(rocket);
  }

  private queueRocketDisposal(rocket: Phaser.Physics.Arcade.Sprite) {
    this.rocketsToDispose.add(rocket);
  }

  private flushRocketDisposals() {
    for (const rocket of this.rocketsToDispose) {
      if (!rocket.active || rocket.getData('state') === 'DESTROYED') continue;
      const burst = this.add.circle(rocket.x, rocket.y, 7, forestPalette.lantern, 0.8).setDepth(8);
      this.tweens.add({ targets: burst, scale: 4, alpha: 0, duration: 180, onComplete: () => burst.destroy() });
      rocket.setData('state', 'DESTROYED' satisfies RocketState);
      rocket.destroy();
    }
    this.rocketsToDispose.clear();
  }

  private checkFinitePhysicsValues() {
    if (!import.meta.env.DEV) return;
    const sprites = [...this.players.map((player) => player.sprite), ...this.rockets.getChildren().filter((child): child is Phaser.Physics.Arcade.Sprite => child instanceof Phaser.Physics.Arcade.Sprite)];
    for (const sprite of sprites) {
      const body = sprite.body as Phaser.Physics.Arcade.Body | null;
      if (body && (![sprite.x, sprite.y, body.velocity.x, body.velocity.y].every(Number.isFinite))) {
        console.error('Non-finite physics values detected', { name: sprite.name, x: sprite.x, y: sprite.y, velocityX: body.velocity.x, velocityY: body.velocity.y });
        sprite.setVelocity(0, 0);
      }
    }
  }

  private chooseTarget(playerId: string) {
    const target = this.players.find((player) => player.snapshot.id === playerId);
    if (!target || !isEligibleTarget(target.snapshot, this.local.snapshot.id, this.targetProtectedUntil[playerId], Date.now())) {
      this.bridge.emit('announcement', 'That teammate is not available right now'); return;
    }
    this.targetProtectedUntil[playerId] = Date.now() + 20_000;
    this.transport.selectAbilityTarget({ abilityId: 'ask', targetPlayerId: playerId, clientTime: Date.now() });
    const marker = this.add.text(target.sprite.x, target.sprite.y - 82, '?', { fontFamily: 'monospace', fontSize: '36px', color: '#ffd166', stroke: '#100d25', strokeThickness: 6 }).setOrigin(0.5).setDepth(9);
    this.tweens.add({ targets: marker, y: marker.y - 28, alpha: 0, duration: 1_600, onComplete: () => marker.destroy() });
    this.bridge.emit('announcement', `${target.snapshot.name} received a reflection prompt`);
  }

  private finishPlayer(player: PlayerRuntime) {
    resetHitStun(player.hitState);
    this.finishCount += 1;
    player.snapshot = { ...player.snapshot, state: transitionPlayer(player.snapshot.state, 'FINISHED'), finishPosition: this.finishCount };
    player.sprite.setVelocity(0, 0).setAcceleration(0, 0);
    if (player.snapshot.isLocal) this.time.delayedCall(500, () => this.finishMatch());
  }

  private finishMatch() {
    if (this.matchState === 'FINISHED') return;
    this.players.forEach((player) => resetHitStun(player.hitState));
    this.matchState = 'FINISHED'; this.cameraController.stop(); this.audio.play('finish'); this.publishSnapshot(true);
  }

  private updateLabels() {
    for (const player of this.players) {
      player.label.setPosition(player.sprite.x, player.sprite.y - 44);
      if (!player.sprite.visible) continue;
      const body = player.sprite.body as Phaser.Physics.Arcade.Body;
      this.characterVisuals.update(player.sprite, this.players.indexOf(player), body.velocity.x, body.velocity.y, body.blocked.down || body.touching.down);
      if (body.velocity.y < -60) player.sprite.setAngle(-5 * player.facing).setScale(0.96, 1.06);
      else if (body.velocity.y > 80) player.sprite.setAngle(7 * player.facing).setScale(1.03, 0.97);
      else if (Math.abs(body.velocity.x) > 30) player.sprite.setAngle(0).setScale(1.06, 0.96);
      else player.sprite.setAngle(0).setScale(1);
      if (player === this.local && player.snapshot.state === 'ACTIVE' && this.time.now >= player.speedUntil) player.sprite.clearTint();
    }
    const dangerX = this.cameraController.dangerX(this.cameras.main);
    const warning = this.children.getByName('danger-warning') as Phaser.GameObjects.Rectangle | null;
    if (warning) warning.setX(dangerX);
    else this.add.rectangle(dangerX, sampleMap.height / 2, 8, sampleMap.height, 0x8e493c, 0.72).setName('danger-warning').setDepth(12);
  }

  private publishSnapshot(force = false) {
    if (!force) return;
    this.lastSnapshotAt = this.time.now;
    const checkpoint = sampleMap.checkpoints.find((point) => point.id === this.local?.snapshot.checkpointId);
    this.bridge.emit('snapshot', {
      state: this.matchState,
      timeRemainingMs: Math.max(0, gameplayConfig.world.matchDurationMs - this.elapsedMs),
      countdown: this.countdown,
      players: this.players.map((player) => ({ ...player.snapshot })),
      checkpointLabel: checkpoint?.label ?? 'Launch Pad',
      danger: this.local ? this.local.sprite.x < this.cameraController.dangerX(this.cameras.main) + 220 : false,
      cooldowns: this.abilityController.cooldowns(this.time.now),
    });
  }

  private setPlayerState(player: PlayerRuntime, next: PlayerState) {
    player.snapshot = { ...player.snapshot, state: transitionPlayer(player.snapshot.state, next) };
  }
}
