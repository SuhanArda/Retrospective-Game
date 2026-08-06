import Phaser from 'phaser';
import { gameplayConfig } from '../../data/gameplayConfig';
import { retroQuestions } from '../../data/retroQuestions';
import type { AbilityId, MatchSnapshot, PlayerSnapshot, PlayerState, RetroQuestion } from '../../domain/types';
import { transitionPlayer } from '../../domain/types';
import { canRocketHit, isBehindCamera, isEligibleTarget } from '../../domain/rules';
import type { GameEventBridge } from '../../bridge/GameEventBridge';
import type { GameTransport } from '../../networking/GameTransport';
import { sampleMap } from '../map/sampleMap';
import { CameraController } from '../controllers/CameraController';
import { AbilityController } from '../controllers/AbilityController';
import { RespawnSystem } from '../systems/RespawnSystem';
import { SeededRandom } from '../../testing/bot/SeededRandom';
import { AudioManager } from '../../audio/AudioManager';

interface PlayerRuntime {
  snapshot: PlayerSnapshot;
  sprite: Phaser.Physics.Arcade.Sprite;
  label: Phaser.GameObjects.Text;
  facing: -1 | 1;
  lastGroundedAt: number;
  jumpBufferedAt: number;
  invulnerableUntil: number;
  speedUntil: number;
  botJumpAt: number;
}

export class GameScene extends Phaser.Scene {
  private players: PlayerRuntime[] = [];
  private local!: PlayerRuntime;
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private rockets!: Phaser.Physics.Arcade.Group;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<'a' | 'd' | 'w' | 'one' | 'two' | 'three', Phaser.Input.Keyboard.Key>;
  private readonly cameraController = new CameraController();
  private readonly abilityController = new AbilityController();
  private readonly respawnSystem = new RespawnSystem(sampleMap.checkpoints);
  private readonly random = new SeededRandom(20260806);
  private readonly audio = new AudioManager();
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
    this.cameras.main.setBackgroundColor('#100d25');
    this.createTextures();
    this.createBackdrop();
    this.createLevel();
    this.createPlayers();
    this.createInputs();
    this.bindBridge();
    this.publishSnapshot(true);
  }

  update(time: number, delta: number) {
    if (this.matchState === 'COUNTDOWN') return;
    if (this.matchState !== 'RUNNING') { this.updateLabels(); return; }
    this.elapsedMs += delta;
    this.cameraController.update(this.cameras.main, delta, sampleMap.width);
    this.updateLocal(time, delta);
    this.updateBots(time);
    this.updatePlayers(time);
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
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsubscribers.splice(0).forEach((unsubscribe) => unsubscribe()));
  }

  private createTextures() {
    const graphics = this.add.graphics();
    graphics.fillStyle(0xffffff).fillRoundedRect(0, 0, 64, 32, 8).generateTexture('platform', 64, 32).clear();
    const colors = [0xffd166, 0x66e3c4, 0xff7da8, 0x8db6ff];
    colors.forEach((color, index) => {
      graphics.fillStyle(color).fillRoundedRect(5, 3, 34, 45, 8);
      graphics.fillStyle(0x171331).fillRect(11, 15, 6, 6).fillRect(27, 15, 6, 6).fillRect(14, 35, 16, 5);
      graphics.generateTexture(`runner-${index}`, 44, 52).clear();
    });
    graphics.fillStyle(0xffd166).fillTriangle(0, 8, 22, 0, 22, 16).generateTexture('rocket', 24, 16).clear();
    graphics.destroy();
  }

  private createBackdrop() {
    const bg = this.add.graphics();
    bg.fillStyle(0x1b1640).fillRect(0, 0, sampleMap.width, sampleMap.height);
    for (let x = 80; x < sampleMap.width; x += 260) {
      const height = 100 + ((x * 17) % 190);
      bg.fillStyle(x % 520 === 80 ? 0x292456 : 0x24204c).fillRect(x, 620 - height, 180, height);
      bg.fillStyle(0x6d65a8, 0.35);
      for (let wy = 650 - height; wy < 590; wy += 36) bg.fillRect(x + 25, wy, 18, 12);
    }
    for (let x = 40; x < sampleMap.width; x += 340) bg.fillStyle(0xffffff, 0.35).fillCircle(x, 100 + x % 130, 2);
    bg.setDepth(-10);
  }

  private createLevel() {
    this.platforms = this.physics.add.staticGroup();
    sampleMap.platforms.forEach((platform) => {
      const body = this.platforms.create(platform.x + platform.width / 2, platform.y, 'platform') as Phaser.Physics.Arcade.Sprite;
      body.setDisplaySize(platform.width, platform.height).refreshBody().setTint(platform.y < 600 ? 0x8274d9 : 0x39356b);
    });
    sampleMap.checkpoints.slice(1).forEach((checkpoint) => {
      this.add.rectangle(checkpoint.x, checkpoint.y + 25, 8, 110, 0x66e3c4, 0.38).setOrigin(0.5, 1);
      this.add.text(checkpoint.x + 12, checkpoint.y - 80, checkpoint.label, { fontFamily: 'monospace', fontSize: '14px', color: '#b7fff0' });
    });
    sampleMap.pickups.forEach((pickup) => {
      this.add.circle(pickup.x, pickup.y, 18, pickup.ability === 'speed' ? 0x66e3c4 : 0xffd166, 0.22).setStrokeStyle(3, pickup.ability === 'speed' ? 0x66e3c4 : 0xffd166);
      this.add.text(pickup.x, pickup.y, pickup.ability === 'speed' ? '»' : '➜', { fontFamily: 'monospace', fontSize: '20px', color: '#ffffff' }).setOrigin(0.5);
    });
    const finish = sampleMap.finish;
    this.add.rectangle(finish.x, finish.y + finish.height / 2, finish.width, finish.height, 0xffd166, 0.28);
    this.add.text(finish.x - 55, finish.y - 34, 'RETRO DECK', { fontFamily: 'monospace', fontSize: '18px', color: '#ffd166', fontStyle: 'bold' });
    this.rockets = this.physics.add.group({ allowGravity: false });
    this.physics.add.collider(this.rockets, this.platforms, (rocket) => this.explode(rocket as Phaser.Physics.Arcade.Sprite));
  }

  private createPlayers() {
    const definitions = [
      { id: 'local', name: 'Local Player', color: 0xffd166, icon: '◆' },
      { id: 'ada', name: 'Ada', color: 0x66e3c4, icon: '▲' },
      { id: 'mert', name: 'Mert', color: 0xff7da8, icon: '●' },
      { id: 'ece', name: 'Ece', color: 0x8db6ff, icon: '■' },
    ];
    this.players = definitions.map((definition, index) => {
      const sprite = this.physics.add.sprite(sampleMap.spawn.x - index * 46, sampleMap.spawn.y, `runner-${index}`);
      sprite.setCollideWorldBounds(false).setDepth(4);
      sprite.body?.setSize(27, 39).setOffset(8, 10);
      this.physics.add.collider(sprite, this.platforms);
      const label = this.add.text(sprite.x, sprite.y - 45, `${definition.icon} ${definition.name}`, { fontFamily: 'monospace', fontSize: '13px', color: '#ffffff', stroke: '#100d25', strokeThickness: 4 }).setOrigin(0.5).setDepth(6);
      return {
        snapshot: { ...definition, state: 'ACTIVE' as PlayerState, isLocal: index === 0, checkpointId: 'start', eliminations: 0, answers: 0 },
        sprite, label, facing: 1 as const, lastGroundedAt: 0, jumpBufferedAt: -9999, invulnerableUntil: 0, speedUntil: 0, botJumpAt: 0,
      };
    });
    this.local = this.players[0]!;
    for (const player of this.players) {
      this.physics.add.overlap(this.rockets, player.sprite, (rocket) => this.hitByRocket(rocket as Phaser.Physics.Arcade.Sprite, player));
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
    const grounded = body.blocked.down || body.touching.down;
    if (grounded) player.lastGroundedAt = time;
    const left = this.cursors.left.isDown || this.keys.a.isDown;
    const right = this.cursors.right.isDown || this.keys.d.isDown;
    const jumpDown = Phaser.Input.Keyboard.JustDown(this.cursors.up) || Phaser.Input.Keyboard.JustDown(this.cursors.space) || Phaser.Input.Keyboard.JustDown(this.keys.w);
    if (jumpDown) player.jumpBufferedAt = time;
    const direction = Number(right) - Number(left);
    const speedMultiplier = time < player.speedUntil ? 1.5 : 1;
    if (direction !== 0) {
      player.facing = direction as -1 | 1;
      player.sprite.setAccelerationX(direction * gameplayConfig.player.acceleration * speedMultiplier);
      player.sprite.setFlipX(direction < 0);
    } else {
      player.sprite.setAccelerationX(0);
      const speed = Math.max(0, Math.abs(body.velocity.x) - gameplayConfig.player.deceleration * delta / 1000);
      player.sprite.setVelocityX(Math.sign(body.velocity.x) * speed);
    }
    player.sprite.setMaxVelocity(gameplayConfig.player.maxRunSpeed * speedMultiplier, 900);
    if (time - player.jumpBufferedAt <= gameplayConfig.player.jumpBufferMs && time - player.lastGroundedAt <= gameplayConfig.player.coyoteTimeMs) {
      player.sprite.setVelocityY(-gameplayConfig.player.jumpVelocity); player.jumpBufferedAt = -9999; this.audio.play('jump');
    }
    if (!this.cursors.up.isDown && !this.cursors.space.isDown && !this.keys.w.isDown && body.velocity.y < -180) player.sprite.setVelocityY(body.velocity.y * 0.9);
    if (Phaser.Input.Keyboard.JustDown(this.keys.one)) this.useAbility('speed');
    if (Phaser.Input.Keyboard.JustDown(this.keys.two)) this.useAbility('rocket');
    if (Phaser.Input.Keyboard.JustDown(this.keys.three)) this.useAbility('ask');
    this.transport.sendPlayerInput({ sequence: ++this.inputSequence, left, right, jump: jumpDown, sentAt: Date.now() });
  }

  private updateBots(time: number) {
    for (const bot of this.players.slice(1)) {
      if (bot.snapshot.state !== 'ACTIVE' && bot.snapshot.state !== 'INVULNERABLE') continue;
      bot.sprite.setAccelerationX(880);
      bot.sprite.setMaxVelocity(220 + (bot.snapshot.name.length * 11), 900);
      const body = bot.sprite.body as Phaser.Physics.Arcade.Body;
      if ((body.blocked.right || this.gapAhead(bot.sprite.x)) && body.blocked.down && time > bot.botJumpAt) {
        bot.sprite.setVelocityY(-gameplayConfig.player.jumpVelocity * (0.88 + this.random.next() * 0.12));
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
      if (player.snapshot.state === 'INVULNERABLE' && time >= player.invulnerableUntil) {
        this.setPlayerState(player, 'ACTIVE'); player.sprite.clearTint().setAlpha(1);
      } else if (player.snapshot.state === 'INVULNERABLE') player.sprite.setAlpha(Math.floor(time / 100) % 2 ? 0.4 : 1);
      if (player.snapshot.state !== 'ACTIVE') continue;
      const passed = [...sampleMap.checkpoints].reverse().find((checkpoint) => player.sprite.x >= checkpoint.x);
      if (passed && passed.id !== player.snapshot.checkpointId) {
        player.snapshot = { ...player.snapshot, checkpointId: passed.id };
        if (player.snapshot.isLocal) { this.audio.play('checkpoint'); this.bridge.emit('announcement', `Checkpoint reached: ${passed.label}`); }
      }
      if (player.sprite.y > sampleMap.height + 40 || isBehindCamera(player.sprite.x, this.cameras.main.scrollX, gameplayConfig.camera.dangerOffset)) this.eliminate(player);
      if (player.sprite.x >= sampleMap.finish.x && player.snapshot.state === 'ACTIVE') this.finishPlayer(player);
    }
  }

  private eliminate(player: PlayerRuntime) {
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
    player.label.setVisible(true); player.invulnerableUntil = this.time.now + gameplayConfig.player.invulnerabilityMs;
    if (player.snapshot.isLocal) { this.audio.play('respawn'); this.bridge.emit('announcement', 'Ready to continue'); }
    this.publishSnapshot(true);
  }

  private useAbility(id: AbilityId) {
    if (this.matchState !== 'RUNNING' || !['ACTIVE', 'INVULNERABLE'].includes(this.local.snapshot.state)) return;
    const now = this.time.now;
    if (!this.abilityController.tryUse(id, now)) { this.bridge.emit('announcement', 'That ability is still recharging'); return; }
    this.transport.useAbility({ abilityId: id, direction: this.local.facing, clientTime: Date.now() });
    this.audio.play('ability');
    if (id === 'speed') { this.local.speedUntil = now + 3_000; this.local.sprite.setTint(0xfff1a8); }
    if (id === 'rocket') this.fireRocket(this.local);
    if (id === 'ask') this.bridge.emit('targetSelectionOpened', { protectedTargets: this.targetProtectedUntil });
    this.publishSnapshot(true);
  }

  private fireRocket(owner: PlayerRuntime) {
    const rocket = this.rockets.create(owner.sprite.x + owner.facing * 35, owner.sprite.y, 'rocket') as Phaser.Physics.Arcade.Sprite;
    rocket.setData('ownerId', owner.snapshot.id).setData('expiresAt', this.time.now + gameplayConfig.rocket.lifetimeMs).setVelocityX(owner.facing * gameplayConfig.rocket.speed).setFlipX(owner.facing < 0);
    this.audio.play('rocket');
    this.time.delayedCall(gameplayConfig.rocket.lifetimeMs, () => { if (rocket.active) this.explode(rocket); });
  }

  private hitByRocket(rocket: Phaser.Physics.Arcade.Sprite, target: PlayerRuntime) {
    const ownerId = String(rocket.getData('ownerId'));
    if (!rocket.active || !canRocketHit(ownerId, target.snapshot)) return;
    const direction = Math.sign(rocket.body?.velocity.x ?? 1);
    target.sprite.setVelocity(direction * gameplayConfig.rocket.knockbackX, -gameplayConfig.rocket.knockbackY).setTint(0xffffff);
    this.time.delayedCall(150, () => { if (target.sprite.active && target.snapshot.state === 'ACTIVE') target.sprite.clearTint(); });
    this.explode(rocket);
  }

  private explode(rocket: Phaser.Physics.Arcade.Sprite) {
    if (!rocket.active) return;
    const burst = this.add.circle(rocket.x, rocket.y, 7, 0xffd166, 0.8).setDepth(8);
    this.tweens.add({ targets: burst, scale: 4, alpha: 0, duration: 180, onComplete: () => burst.destroy() });
    rocket.destroy();
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
    this.finishCount += 1;
    player.snapshot = { ...player.snapshot, state: transitionPlayer(player.snapshot.state, 'FINISHED'), finishPosition: this.finishCount };
    player.sprite.setVelocity(0, 0).setAcceleration(0, 0);
    if (player.snapshot.isLocal) this.time.delayedCall(500, () => this.finishMatch());
  }

  private finishMatch() {
    if (this.matchState === 'FINISHED') return;
    this.matchState = 'FINISHED'; this.cameraController.stop(); this.audio.play('finish'); this.publishSnapshot(true);
  }

  private updateLabels() {
    for (const player of this.players) {
      player.label.setPosition(player.sprite.x, player.sprite.y - 44);
      if (!player.sprite.visible) continue;
      const body = player.sprite.body as Phaser.Physics.Arcade.Body;
      if (body.velocity.y < -60) player.sprite.setAngle(-5 * player.facing).setScale(0.96, 1.06);
      else if (body.velocity.y > 80) player.sprite.setAngle(7 * player.facing).setScale(1.03, 0.97);
      else if (Math.abs(body.velocity.x) > 30) player.sprite.setAngle(0).setScale(1.06, 0.96);
      else player.sprite.setAngle(0).setScale(1);
      if (player === this.local && player.snapshot.state === 'ACTIVE' && this.time.now >= player.speedUntil) player.sprite.clearTint();
    }
    const dangerX = this.cameraController.dangerX(this.cameras.main);
    const warning = this.children.getByName('danger-warning') as Phaser.GameObjects.Rectangle | null;
    if (warning) warning.setX(dangerX);
    else this.add.rectangle(dangerX, sampleMap.height / 2, 8, sampleMap.height, 0xff4d6d, 0.58).setName('danger-warning').setDepth(12);
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
