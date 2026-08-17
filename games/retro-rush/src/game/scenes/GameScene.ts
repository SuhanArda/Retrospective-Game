import Phaser from 'phaser';
import { gameplayConfig } from '../../data/gameplayConfig';
import { retroQuestions } from '../../data/retroQuestions';
import type { AbilityId, MatchSnapshot, PlayerSnapshot, PlayerState, Point, RetroQuestion } from '../../domain/types';
import { transitionPlayer } from '../../domain/types';
import { isBehindCamera, isEligibleTarget } from '../../domain/rules';
import type { GameEventBridge } from '../../bridge/GameEventBridge';
import type { GameTransport } from '../../networking/GameTransport';
import { sampleMap } from '../map/sampleMap';
import { CameraController } from '../controllers/CameraController';
import { AbilityController } from '../controllers/AbilityController';
import { SeededRandom } from '../../testing/bot/SeededRandom';
import { AudioManager } from '../../audio/AudioManager';
import { calculateHomingVelocity, findNearestRocketTarget, resolveRocketHit, velocityTowards, type PositionedPlayer, type RocketState } from '../controllers/RocketLifecycle';
import { applyJumpCut, clampDeltaSeconds, createJumpState, recordJumpPress, resetJumpState, tryStartJump, updateGroundedState, type JumpState } from '../controllers/PlayerMovementController';
import { collectPickup, type PickupState } from '../systems/PickupSystem';
import { segmentIntersectsExpandedAabb } from '../controllers/RocketCollision';
import { ParallaxBackgroundSystem } from '../visuals/ParallaxBackgroundSystem';
import { TerrainRenderer } from '../visuals/TerrainRenderer';
import { PropPlacementSystem } from '../visuals/PropPlacementSystem';
import { ChunkDebugRenderer } from '../visuals/ChunkDebugRenderer';
import { CharacterVisualController } from '../visuals/CharacterVisualController';
import { forestPalette } from '../visuals/visualConfig';
import { beginHitStun, createPlayerHitState, fixedLeftKnockbackVelocity, isInHitStun, resetHitStun, updateHitStun, type PlayerHitState } from '../controllers/PlayerHitState';
import { canAttemptPlayerShove, findShoveTarget, PlayerShoveController, shoveVelocityAwayFrom, type PositionedShovePlayer } from '../controllers/PlayerShoveController';
import { resetPlayerSnapshotForRound, roundSpawnPosition } from '../controllers/RoundReset';
import { ProceduralMapGenerator, RoundSeedSequence, type GeneratedChunk } from '../systems/ProceduralMapGenerator';
import type {
  RetroRushGameSnapshot,
  RetroRushPickupCollected,
  RetroRushPlayerEliminated,
  RetroRushPlayerSnapshot,
  RetroRushRocketHitApplied,
  RetroRushRocketSnapshot,
  RetroRushShoveApplied,
} from '@retro-platform/contracts';
import { RemotePlayerInterpolator } from '../../networking/RemotePlayerInterpolator';
import type { ServerEvent } from '../../networking/transportMessages';

interface PlayerRuntime {
  snapshot: PlayerSnapshot;
  sprite: Phaser.Physics.Arcade.Sprite;
  label: Phaser.GameObjects.Text;
  spawn: Point;
  facing: -1 | 1;
  jumpState: JumpState;
  hitState: PlayerHitState;
  invulnerableUntil: number;
  speedUntil: number;
  botJumpAt: number;
  skinIndex: number;
  slot: number;
  interpolation?: RemotePlayerInterpolator;
}

interface PickupRuntime extends PickupState {
  id: string;
  ability: AbilityId;
  zone: Phaser.GameObjects.Zone;
  visuals: Array<Phaser.GameObjects.Arc | Phaser.GameObjects.Text>;
  overlaps: Phaser.Physics.Arcade.Collider[];
  pending: boolean;
}

interface ChunkRuntime {
  bodies: Phaser.Physics.Arcade.Sprite[];
  visuals: Phaser.GameObjects.GameObject[];
  pickups: PickupRuntime[];
}

export class GameScene extends Phaser.Scene {
  private players: PlayerRuntime[] = [];
  private readonly playersById = new Map<string, PlayerRuntime>();
  private local!: PlayerRuntime;
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private playerBodies!: Phaser.Physics.Arcade.Group;
  private rockets!: Phaser.Physics.Arcade.Group;
  private readonly rocketsToDispose = new Set<Phaser.Physics.Arcade.Sprite>();
  private pickups: PickupRuntime[] = [];
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<'a' | 'd' | 'w' | 'one' | 'two' | 'three', Phaser.Input.Keyboard.Key>;
  private readonly cameraController = new CameraController();
  private readonly abilityController = new AbilityController();
  private readonly shoveController = new PlayerShoveController(gameplayConfig.shove);
  private readonly random = new SeededRandom(20260806);
  private readonly audio = new AudioManager();
  private readonly background = new ParallaxBackgroundSystem();
  private readonly terrainRenderer = new TerrainRenderer();
  private readonly propPlacement = new PropPlacementSystem();
  private readonly chunkDebugRenderer = new ChunkDebugRenderer();
  private readonly characterVisuals = new CharacterVisualController();
  private matchState: MatchSnapshot['state'] = 'WAITING';
  private countdown = 3;
  private elapsedMs = 0;
  private lastSnapshotAt = 0;
  private questionIndex = 0;
  private questionPool: readonly RetroQuestion[];
  private activeQuestionId: string | null = null;
  private activeOnlineQuestion: NonNullable<RetroRushGameSnapshot['activeQuestion']> | null = null;
  private targetProtectedUntil: Record<string, number> = {};
  private inputSequence = 0;
  private readonly temporaryEffects = new Set<Phaser.GameObjects.GameObject>();
  // Mock authority owns this seed sequence. Production SignalR should distribute
  // one authoritative round seed (or chunk sequence) to every room client.
  private readonly roundSeeds = new RoundSeedSequence(Date.now());
  private mapGenerator?: ProceduralMapGenerator;
  private readonly chunkRuntimes = new Map<string, ChunkRuntime>();
  private worldWidth = gameplayConfig.proceduralMap.startPlatformWidth;
  private countdownText?: Phaser.GameObjects.Text;
  private unsubscribers: Array<() => void> = [];
  private networkRoundId = 0;
  private networkMapSeed: number | null = null;
  private networkSequence = 0;
  private networkSendAccumulatorMs = 0;
  private roundStartsAtUtc = 0;
  private eliminationPending = false;
  private readonly collectedPickupIds = new Set<string>();
  private readonly appliedShoveIds = new Set<string>();
  private readonly resolvedRocketIds = new Set<string>();
  private developmentDebugApi?: NonNullable<Window['__RETRO_RUSH_DEBUG__']>;
  private developmentMoveDirection: -1 | 0 | 1 = 0;
  private networkSnapshotsSent = 0;
  private networkSnapshotsReceived = 0;

  constructor(private readonly bridge: GameEventBridge, private readonly transport: GameTransport, questionPool: readonly RetroQuestion[] = retroQuestions) {
    super({ key: 'GameScene' });
    this.questionPool = questionPool;
  }

  setQuestionPool(questions: readonly RetroQuestion[]) {
    this.questionPool = questions;
    if (questions.length > 0 && this.activeOnlineQuestion) this.presentOnlineQuestion(this.activeOnlineQuestion, false);
  }

  create() {
    this.matchState = 'WAITING';
    this.countdown = 3;
    this.elapsedMs = 0;
    this.targetProtectedUntil = {};
    this.inputSequence = 0;
    this.abilityController.reset();
    this.shoveController.reset();
    this.cameraController.reset(this.cameras.main);
    this.physics.world.setBounds(0, 0, this.worldWidth, sampleMap.height);
    this.cameras.main.setBounds(0, 0, this.worldWidth, sampleMap.height);
    this.cameras.main.setBackgroundColor('#b8a6bd');
    this.createTextures();
    this.createBackdrop();
    this.createLevel();
    if (this.transport.mode === 'standalone') this.createPlayers();
    this.createInputs();
    this.bindBridge();
    this.installDevelopmentDebugApi();
    this.publishSnapshot(true);
  }

  update(time: number, delta: number) {
    this.flushRocketDisposals();
    this.background.update(this.cameras.main.scrollX);
    if (this.transport.mode === 'online') {
      this.syncOnlinePhase();
      this.updateRemotePlayers();
    }
    if (this.matchState === 'COUNTDOWN') { this.updateLabels(); return; }
    if (this.matchState !== 'RUNNING') { this.updateLabels(); return; }
    this.elapsedMs += delta;
    this.maintainProceduralMap();
    this.cameraController.update(this.cameras.main, delta, this.worldWidth, this.players.map((player) => ({ x: player.sprite.x, state: player.snapshot.state })));
    this.updateLocal(time, delta);
    if (this.transport.mode === 'standalone') this.updateBots(time);
    this.updateRockets(delta);
    this.updatePlayers(time);
    this.checkFinitePhysicsValues();
    this.updateLabels();
    if (this.transport.mode === 'online') this.sendNetworkSnapshot(delta);
    this.publishSnapshot(time - this.lastSnapshotAt > 150);
  }

  private bindBridge() {
    this.unsubscribers.push(
      this.bridge.on('startMatch', () => { if (this.transport.mode === 'standalone') this.startCountdown(); }),
      this.bridge.on('restartMatch', () => { if (this.transport.mode === 'standalone') this.resetRound(); }),
      this.bridge.on('questionAnswered', ({ questionId }) => this.handleQuestionAnswered(questionId)),
      this.bridge.on('abilityRequested', ({ abilityId }) => this.useAbility(abilityId)),
      this.bridge.on('targetSelected', ({ playerId }) => this.chooseTarget(playerId)),
      this.bridge.on('audioMuted', ({ muted }) => this.audio.setMuted(muted)),
      this.transport.subscribe((event) => this.handleTransportEvent(event)),
    );
    const cleanup = () => {
      this.players.forEach((player) => resetHitStun(player.hitState));
      this.input.off('pointerdown', this.handlePointerDown, this);
      this.unsubscribers.splice(0).forEach((unsubscribe) => unsubscribe());
      this.players = [];
      this.playersById.clear();
      this.pickups = [];
      this.chunkRuntimes.clear();
      if (import.meta.env.DEV && window.__RETRO_RUSH_DEBUG__ === this.developmentDebugApi)
        delete window.__RETRO_RUSH_DEBUG__;
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup);
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
    this.playerBodies = this.physics.add.group();
    this.rockets = this.physics.add.group({ allowGravity: false });
    this.physics.add.collider(this.rockets, this.platforms, (rocket) => this.resolveRocket(rocket as Phaser.Physics.Arcade.Sprite, 'EXPIRED'));
    if (this.transport.mode === 'standalone') this.createProceduralMap();
  }

  private installDevelopmentDebugApi() {
    if (!import.meta.env.DEV) return;
    this.developmentDebugApi = {
      state: () => ({
        mode: this.transport.mode,
        localPlayerId: this.transport.localPlayerId,
        gameSessionId: this.transport.gameSessionId,
        roundId: this.networkRoundId,
        mapSeed: this.networkMapSeed,
        matchState: this.matchState,
        cameraScrollX: this.cameras.main.scrollX,
        players: this.players.map((player) => {
          const body = player.sprite.body as Phaser.Physics.Arcade.Body;
          return {
            id: player.snapshot.id, isLocal: player.snapshot.isLocal, state: player.snapshot.state,
            x: player.sprite.x, y: player.sprite.y, velocityX: body.velocity.x, velocityY: body.velocity.y,
            visible: player.sprite.visible, active: player.sprite.active, bodyEnabled: body.enable,
          };
        }),
        networkSnapshotsSent: this.networkSnapshotsSent,
        networkSnapshotsReceived: this.networkSnapshotsReceived,
        chunks: (this.mapGenerator?.activeChunks ?? []).map((chunk) => ({
          id: chunk.id, templateId: chunk.templateId,
          platforms: chunk.platforms.map(({ x, y, width, height }) => ({ x, y, width, height })),
        })),
        pickups: this.pickups.map((pickup) => ({
          id: pickup.id, ability: pickup.ability, active: pickup.active, x: pickup.zone.x, y: pickup.zone.y,
        })),
        ownedAbilities: this.abilityController.ownedAbilities(),
        rockets: this.rockets.getChildren().map((child) => {
          const rocket = child as Phaser.Physics.Arcade.Sprite;
          return { id: String(rocket.getData('rocketId')), ownerId: String(rocket.getData('ownerId')), targetId: String(rocket.getData('targetId')) };
        }),
      }),
      setLocalPosition: (x, y) => {
        if (this.local && Number.isFinite(x) && Number.isFinite(y)) this.local.sprite.setPosition(x, y).setVelocity(0, 0);
      },
      shove: () => this.attemptPlayerShove(),
      useAbility: (abilityId) => this.useAbility(abilityId),
      setMoveDirection: (direction) => { this.developmentMoveDirection = direction; },
      jump: () => {
        if (this.local?.sprite.body) this.local.sprite.setVelocityY(-gameplayConfig.player.jumpVelocity);
      },
      generateThrough: (x) => {
        if (!Number.isFinite(x) || !this.mapGenerator) return;
        this.mapGenerator.generateThrough(x).forEach((chunk) => this.appendChunk(chunk));
        this.updateWorldBounds();
      },
      disconnect: () => { void this.transport.disconnect(); },
      reconnect: () => { void this.transport.connect({ roomCode: '', playerName: this.local?.snapshot.name ?? 'Player' }); },
    };
    window.__RETRO_RUSH_DEBUG__ = this.developmentDebugApi;
  }

  private createProceduralMap(seed = this.roundSeeds.nextSeed()) {
    this.mapGenerator = new ProceduralMapGenerator(
      seed,
      gameplayConfig.proceduralMap,
      gameplayConfig.player,
      gameplayConfig.world.floorY,
    );
    this.pickups = [];
    this.mapGenerator.createInitialChunks().forEach((chunk) => this.appendChunk(chunk));
    this.updateWorldBounds();
  }

  private appendChunk(chunk: GeneratedChunk) {
    const bodies = chunk.platforms.map((platform) => {
      const body = this.platforms.create(platform.x + platform.width / 2, platform.y, 'platform') as Phaser.Physics.Arcade.Sprite;
      body.setDisplaySize(platform.width, platform.height).refreshBody().setVisible(false);
      return body;
    });
    const visuals: Phaser.GameObjects.GameObject[] = [
      ...chunk.platforms.flatMap((platform) => this.terrainRenderer.render(this, platform)),
      ...chunk.decorations.map((decoration) => this.propPlacement.render(this, decoration)),
      ...(import.meta.env.DEV && gameplayConfig.proceduralMap.debugChunks ? this.chunkDebugRenderer.render(this, chunk) : []),
    ];
    const pickups = chunk.pickups.map((pickup): PickupRuntime => {
      const color = pickup.ability === 'speed' ? 0xc98b55 : pickup.ability === 'rocket' ? forestPalette.lantern : 0xb69ac8;
      const circle = this.add.circle(pickup.x, pickup.y, 18, color, 0.3).setStrokeStyle(3, color).setDepth(5);
      const glow = this.add.circle(pickup.x, pickup.y, 30, color, 0.08).setDepth(4.9);
      const icon = this.add.text(pickup.x, pickup.y, pickup.ability === 'speed' ? '»' : pickup.ability === 'rocket' ? '➜' : '?', { fontFamily: 'monospace', fontSize: '20px', color: '#fff0c9' }).setOrigin(0.5).setDepth(5.1);
      const zone = this.add.zone(pickup.x, pickup.y, 50, 50);
      this.physics.add.existing(zone, true);
      const collected = this.collectedPickupIds.has(pickup.id);
      if (collected) {
        (zone.body as Phaser.Physics.Arcade.StaticBody).enable = false;
        circle.setVisible(false); glow.setVisible(false); icon.setVisible(false);
      }
      return { id: pickup.id, active: !collected, pending: false, ability: pickup.ability, zone, visuals: [circle, glow, icon], overlaps: [] };
    });
    this.pickups.push(...pickups);
    this.chunkRuntimes.set(chunk.id, { bodies, visuals, pickups });
    if (this.players.length > 0) {
      for (const pickup of pickups) for (const player of this.players) this.registerPickupOverlap(player, pickup);
    }
  }

  private registerPickupOverlap(player: PlayerRuntime, pickup: PickupRuntime) {
    pickup.overlaps.push(this.physics.add.overlap(player.sprite, pickup.zone, () => this.tryCollectPickup(player, pickup)));
  }

  private maintainProceduralMap() {
    if (!this.mapGenerator) return;
    const config = gameplayConfig.proceduralMap;
    const generationTarget = this.cameras.main.worldView.right + config.chunksAhead * config.targetChunkLength;
    this.mapGenerator.generateThrough(generationTarget).forEach((chunk) => this.appendChunk(chunk));
    const cleanupThreshold = this.cameras.main.scrollX - config.chunksBehind * config.targetChunkLength;
    this.mapGenerator.removeChunksBefore(cleanupThreshold).forEach((chunk) => this.destroyChunk(chunk.id));
    this.updateWorldBounds();
  }

  private updateWorldBounds() {
    if (!this.mapGenerator) return;
    this.worldWidth = Math.max(this.cameras.main.width, this.mapGenerator.generatedEndX);
    this.physics.world.setBounds(0, 0, this.worldWidth, sampleMap.height);
    this.cameras.main.setBounds(0, 0, this.worldWidth, sampleMap.height);
  }

  private destroyChunk(chunkId: string) {
    const runtime = this.chunkRuntimes.get(chunkId);
    if (!runtime) return;
    for (const pickup of runtime.pickups) {
      pickup.overlaps.forEach((overlap) => overlap.destroy());
      pickup.zone.destroy();
      pickup.visuals.forEach((visual) => visual.destroy());
    }
    for (const body of runtime.bodies) this.platforms.remove(body, true, true);
    runtime.visuals.forEach((visual) => visual.destroy());
    const removed = new Set(runtime.pickups);
    this.pickups = this.pickups.filter((pickup) => !removed.has(pickup));
    this.chunkRuntimes.delete(chunkId);
  }

  private destroyProceduralMap() {
    for (const chunkId of [...this.chunkRuntimes.keys()]) this.destroyChunk(chunkId);
    this.pickups = [];
    this.mapGenerator = undefined;
  }

  private createPlayers() {
    const definitions = [
      { id: 'local', name: 'Yerel Oyuncu', color: 0xffd166, icon: '' },
      { id: 'ada', name: 'Ada', color: 0x66e3c4, icon: '' },
      { id: 'mert', name: 'Mert', color: 0xff7da8, icon: '' },
      { id: 'ece', name: 'Ece', color: 0x8db6ff, icon: '' },
    ];
    this.players = definitions.map((definition, index) => {
      const spawn = roundSpawnPosition(sampleMap.spawn);
      const sprite = this.physics.add.sprite(spawn.x, spawn.y, `runner-${index}-idle`);
      sprite.setCollideWorldBounds(false).setDepth(4);
      sprite.body?.setSize(27, 39).setOffset(8, 10);
      this.playerBodies.add(sprite);
      this.physics.add.collider(sprite, this.platforms);
      const label = this.add.text(sprite.x, sprite.y - 45, definition.name, { fontFamily: 'monospace', fontSize: '12px', color: '#fff0ce', stroke: '#2c2227', strokeThickness: 4 }).setOrigin(0.5).setDepth(6);
      return {
        snapshot: { ...definition, state: 'ACTIVE' as PlayerState, isLocal: index === 0, checkpointId: 'start', eliminations: 0, answers: 0 },
        sprite, label, spawn, skinIndex: index, slot: index, facing: 1 as const, jumpState: createJumpState(), hitState: createPlayerHitState(), invulnerableUntil: 0, speedUntil: 0, botJumpAt: 0,
      };
    });
    this.players.forEach((player) => this.playersById.set(player.snapshot.id, player));
    this.physics.add.collider(this.playerBodies, this.playerBodies);
    this.local = this.players[0]!;
    for (const player of this.players) {
      this.physics.add.overlap(this.rockets, player.sprite, (rocket) => this.hitByRocket(rocket as Phaser.Physics.Arcade.Sprite, player));
      for (const pickup of this.pickups) this.registerPickupOverlap(player, pickup);
    }
  }

  private ensureNetworkPlayer(networkPlayer: RetroRushPlayerSnapshot) {
    const existing = this.playersById.get(networkPlayer.playerId);
    if (existing) return existing;
    const skinIndex = networkPlayer.skinIndex % 4;
    const spawn = { x: networkPlayer.x, y: networkPlayer.y };
    const sprite = this.physics.add.sprite(spawn.x, spawn.y, `runner-${skinIndex}-idle`);
    sprite.setCollideWorldBounds(false).setDepth(4);
    sprite.body?.setSize(27, 39).setOffset(8, 10);
    const isLocal = networkPlayer.playerId === this.transport.localPlayerId;
    if (isLocal) {
      this.playerBodies.add(sprite);
      this.physics.add.collider(sprite, this.platforms);
    } else {
      const body = sprite.body as Phaser.Physics.Arcade.Body;
      body.setAllowGravity(false);
      body.moves = false;
      body.immovable = true;
    }
    const color = Number.parseInt(networkPlayer.color.replace('#', ''), 16);
    const icon = '';
    const label = this.add.text(sprite.x, sprite.y - 45, networkPlayer.displayName, {
      fontFamily: 'monospace', fontSize: '12px', color: '#fff0ce', stroke: '#2c2227', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(6);
    const runtime: PlayerRuntime = {
      snapshot: {
        id: networkPlayer.playerId, name: networkPlayer.displayName,
        state: networkPlayer.movementState as PlayerState, isLocal,
        color: Number.isFinite(color) ? color : 0xffd166, icon, checkpointId: 'start', eliminations: 0, answers: 0,
      },
      sprite, label, spawn, skinIndex, slot: networkPlayer.slot, facing: networkPlayer.facing === 'left' ? -1 : 1,
      jumpState: createJumpState(), hitState: createPlayerHitState(), invulnerableUntil: 0,
      speedUntil: 0, botJumpAt: 0,
      ...(isLocal ? {} : { interpolation: new RemotePlayerInterpolator(gameplayConfig.network.interpolationDelayMs) }),
    };
    this.players.push(runtime);
    this.players.sort((left, right) => left.slot - right.slot);
    this.playersById.set(runtime.snapshot.id, runtime);
    if (isLocal) this.local = runtime;
    this.physics.add.overlap(this.rockets, sprite, (rocket) => this.hitByRocket(rocket as Phaser.Physics.Arcade.Sprite, runtime));
    for (const pickup of this.pickups) this.registerPickupOverlap(runtime, pickup);
    return runtime;
  }


  private createInputs() {
    if (!this.input.keyboard) throw new Error('Keyboard input is unavailable');
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys({ a: 'A', d: 'D', w: 'W', one: 'ONE', two: 'TWO', three: 'THREE' }) as typeof this.keys;
    this.input.on('pointerdown', this.handlePointerDown, this);
  }

  private handleTransportEvent(event: ServerEvent) {
    switch (event.type) {
      case 'retroSnapshot': this.applyRetroSnapshot(event.snapshot); break;
      case 'retroRoundStarted': this.applyRetroSnapshot(event.snapshot); break;
      case 'retroPlayerUpdated': this.applyRemotePlayerSnapshot(event.player); break;
      case 'retroShoveApplied': this.applyOnlineShove(event.shove); break;
      case 'retroRocketSpawned': this.spawnOnlineRocket(event.rocket); break;
      case 'retroRocketHit': this.applyOnlineRocketHit(event.hit); break;
      case 'retroPickupCollected': this.applyOnlinePickup(event.pickup); break;
      case 'retroPlayerEliminated': this.applyOnlineElimination(event.elimination); break;
      case 'retroTargetQuestioned': this.applyOnlineTargetQuestion(event.question.roundId, event.question.sourcePlayerId, event.question.targetPlayerId); break;
      default: break;
    }
  }

  private applyRetroSnapshot(snapshot: RetroRushGameSnapshot) {
    if (snapshot.gameSessionId !== this.transport.gameSessionId || snapshot.roundId < this.networkRoundId) return;
    const newRound = snapshot.roundId !== this.networkRoundId || snapshot.mapSeed !== this.networkMapSeed;
    this.networkRoundId = snapshot.roundId;
    this.networkMapSeed = snapshot.mapSeed;
    this.roundStartsAtUtc = snapshot.roundStartsAtUtc;
    if (newRound) this.prepareOnlineRound(snapshot.mapSeed);

    const incomingIds = new Set(snapshot.players.map((player) => player.playerId));
    for (const networkPlayer of snapshot.players) {
      const player = this.ensureNetworkPlayer(networkPlayer);
      player.slot = networkPlayer.slot;
      player.snapshot = {
        ...player.snapshot,
        name: networkPlayer.displayName,
        state: networkPlayer.movementState as PlayerState,
        isLocal: networkPlayer.playerId === this.transport.localPlayerId,
      };
      player.facing = networkPlayer.facing === 'left' ? -1 : 1;
      player.sprite.setFlipX(player.facing < 0).setAlpha(networkPlayer.connected ? 1 : 0.45);
      if (newRound) this.resetNetworkPlayerEntity(player, networkPlayer);
      if (player.snapshot.isLocal) {
        this.networkSequence = Math.max(this.networkSequence, networkPlayer.sequence);
        player.sprite.enableBody(true, networkPlayer.x, networkPlayer.y, true, true).setVelocity(networkPlayer.velocityX, networkPlayer.velocityY);
      } else if (!player.snapshot.isLocal) {
        player.interpolation?.push(networkPlayer, performance.now());
      }
      if (!networkPlayer.connected || networkPlayer.movementState === 'DISCONNECTED') {
        player.snapshot = { ...player.snapshot, state: 'DISCONNECTED' };
      }
    }
    for (const player of [...this.players]) {
      if (!incomingIds.has(player.snapshot.id)) this.removeNetworkPlayer(player);
    }
    this.players.sort((left, right) => left.slot - right.slot);
    const localPlayer = snapshot.players.find((player) => player.playerId === this.transport.localPlayerId);
    this.abilityController.restore(localPlayer?.ownedAbilityIds ?? []);

    this.collectedPickupIds.clear();
    snapshot.collectedPickupIds.forEach((pickupId) => this.collectedPickupIds.add(pickupId));
    this.pickups.forEach((pickup) => {
      if (this.collectedPickupIds.has(pickup.id)) this.disablePickup(pickup);
    });
    for (const rocket of snapshot.activeRockets) this.spawnOnlineRocket(rocket);

    if (snapshot.phase === 'RUNNING') this.beginOnlineRunning();
    else if (snapshot.phase === 'COUNTDOWN') {
      this.matchState = 'COUNTDOWN';
      this.updateOnlineCountdown();
    } else this.matchState = 'LOADING';

    if (snapshot.activeQuestion) this.openOnlineQuestion(snapshot.activeQuestion);
    this.publishSnapshot(true);
  }

  private prepareOnlineRound(mapSeed: number) {
    this.matchState = 'COUNTDOWN';
    this.networkSequence = 0;
    this.networkSendAccumulatorMs = 0;
    this.eliminationPending = false;
    this.activeQuestionId = null;
    this.activeOnlineQuestion = null;
    this.appliedShoveIds.clear();
    this.resolvedRocketIds.clear();
    this.collectedPickupIds.clear();
    this.abilityController.reset();
    this.shoveController.reset();
    this.cameraController.reset(this.cameras.main);
    this.countdownText?.destroy();
    this.countdownText = undefined;
    for (const child of this.rockets.getChildren()) child.destroy();
    this.rocketsToDispose.clear();
    this.destroyProceduralMap();
    this.createProceduralMap(mapSeed);
    for (const player of this.players) {
      player.snapshot = resetPlayerSnapshotForRound(player.snapshot);
      player.facing = 1;
      resetJumpState(player.jumpState);
      resetHitStun(player.hitState);
      player.sprite.setAcceleration(0, 0).setVelocity(0, 0).setAlpha(1).setFlipX(false);
    }
    this.bridge.emit('roundReset', undefined);
  }

  private resetNetworkPlayerEntity(player: PlayerRuntime, networkPlayer: RetroRushPlayerSnapshot) {
    player.spawn = { x: networkPlayer.x, y: networkPlayer.y };
    player.interpolation?.reset(networkPlayer.roundId);
    player.invulnerableUntil = 0;
    player.speedUntil = 0;
    player.sprite
      .enableBody(true, networkPlayer.x, networkPlayer.y, true, true)
      .setAcceleration(0, 0)
      .setVelocity(networkPlayer.velocityX, networkPlayer.velocityY)
      .setMaxVelocity(gameplayConfig.player.maxRunSpeed, gameplayConfig.player.maximumFallSpeed)
      .setTint(0xffffff)
      .setAlpha(networkPlayer.connected ? 1 : 0.45)
      .setAngle(0)
      .setScale(1)
      .setFlipX(networkPlayer.facing === 'left');
    const body = player.sprite.body as Phaser.Physics.Arcade.Body;
    if (!player.snapshot.isLocal) {
      body.setAllowGravity(false);
      body.moves = false;
      body.immovable = true;
    }
    player.label.setVisible(true).setPosition(networkPlayer.x, networkPlayer.y - 44);
  }

  private removeNetworkPlayer(player: PlayerRuntime) {
    resetHitStun(player.hitState);
    player.sprite.destroy();
    player.label.destroy();
    this.playersById.delete(player.snapshot.id);
    this.players = this.players.filter((candidate) => candidate !== player);
  }

  private applyRemotePlayerSnapshot(snapshot: RetroRushPlayerSnapshot) {
    if (snapshot.roundId !== this.networkRoundId || snapshot.playerId === this.transport.localPlayerId) return;
    const player = this.ensureNetworkPlayer(snapshot);
    if (!player.interpolation?.push(snapshot, performance.now())) return;
    this.networkSnapshotsReceived++;
    player.snapshot = { ...player.snapshot, state: snapshot.movementState as PlayerState };
    player.facing = snapshot.facing === 'left' ? -1 : 1;
    player.sprite.setFlipX(player.facing < 0).setAlpha(snapshot.connected ? 1 : 0.45);
  }

  private updateRemotePlayers() {
    const now = performance.now();
    for (const player of this.players) {
      if (player.snapshot.isLocal) continue;
      const state = player.interpolation?.sample(now);
      if (!state) continue;
      player.sprite.setPosition(state.x, state.y).setFlipX(state.facing === 'left');
      const body = player.sprite.body as Phaser.Physics.Arcade.Body;
      body.velocity.set(state.velocityX, state.velocityY);
    }
  }

  private applyOnlineShove(shove: RetroRushShoveApplied) {
    if (shove.roundId !== this.networkRoundId || this.appliedShoveIds.has(shove.actionId)) return;
    this.appliedShoveIds.add(shove.actionId);
    const target = this.playersById.get(shove.targetPlayerId);
    if (!target || !target.snapshot.isLocal) return;
    target.sprite.setAccelerationX(0)
      .setMaxVelocity(Math.max(Math.abs(shove.velocityX), gameplayConfig.player.maxRunSpeed), gameplayConfig.player.maximumFallSpeed)
      .setVelocityX(shove.velocityX);
    beginHitStun(target.hitState, this.time.now, shove.hitStunMs);
  }

  private applyOnlinePickup(pickup: RetroRushPickupCollected) {
    if (pickup.roundId !== this.networkRoundId) return;
    this.collectedPickupIds.add(pickup.pickupId);
    const runtime = this.pickups.find((candidate) => candidate.id === pickup.pickupId);
    if (runtime) this.disablePickup(runtime);
    if (pickup.playerId === this.transport.localPlayerId) {
      this.abilityController.grant(pickup.abilityId);
      const pickupName = pickup.abilityId === 'speed' ? 'İvme' : pickup.abilityId === 'rocket' ? 'İtme roketi' : 'Soru';
      this.bridge.emit('announcement', `${pickupName} hazır`);
    }
    this.publishSnapshot(true);
  }

  private disablePickup(pickup: PickupRuntime) {
    collectPickup(pickup);
    pickup.pending = false;
    const body = pickup.zone.body as Phaser.Physics.Arcade.StaticBody;
    body.enable = false;
    pickup.visuals.forEach((visual) => visual.setVisible(false).setActive(false));
  }

  private applyOnlineElimination(elimination: RetroRushPlayerEliminated) {
    if (elimination.roundId !== this.networkRoundId) return;
    const player = this.playersById.get(elimination.playerId);
    if (!player || player.snapshot.state === 'ANSWERING_QUESTION') return;
    resetHitStun(player.hitState);
    player.snapshot = { ...player.snapshot, state: 'ANSWERING_QUESTION', eliminations: player.snapshot.eliminations + 1 };
    player.sprite.disableBody(true, true);
    player.label.setVisible(false);
    this.matchState = 'LOADING';
    this.openOnlineQuestion(elimination.question);
    this.publishSnapshot(true);
  }

  private openOnlineQuestion(question: RetroRushGameSnapshot['activeQuestion']) {
    if (!question || this.activeQuestionId === question.questionId) return;
    this.activeQuestionId = question.questionId;
    this.activeOnlineQuestion = question;
    if (this.questionPool.length > 0) this.presentOnlineQuestion(question, true);
  }

  private presentOnlineQuestion(question: NonNullable<RetroRushGameSnapshot['activeQuestion']>, announce: boolean) {
    const indexedQuestion = this.questionPool.length > 0 && Number.isInteger(question.questionIndex)
      ? this.questionPool[question.questionIndex! % this.questionPool.length]
      : undefined;
    if (!indexedQuestion) return;
    this.bridge.emit('questionOpened', {
      id: question.questionId,
      category: indexedQuestion.category,
      type: indexedQuestion.type,
      prompt: indexedQuestion.prompt,
      ...(indexedQuestion.options ? { options: indexedQuestion.options } : {}),
      required: indexedQuestion.required,
      ownerPlayerId: question.ownerPlayerId,
      ownerName: this.playersById.get(question.ownerPlayerId)?.snapshot.name ?? 'Oyuncu',
      canConfirm: question.ownerPlayerId === this.transport.localPlayerId,
    });
    if (announce) this.bridge.emit('announcement', 'Retrospektif sorusunu sözlü olarak yanıtla');
  }

  private syncOnlinePhase() {
    if (this.networkRoundId === 0 || this.matchState !== 'COUNTDOWN') return;
    if (Date.now() >= this.roundStartsAtUtc) this.beginOnlineRunning();
    else this.updateOnlineCountdown();
  }

  private updateOnlineCountdown() {
    this.countdown = Math.max(1, Math.ceil((this.roundStartsAtUtc - Date.now()) / 1_000));
    if (!this.countdownText) {
      this.countdownText = this.add.text(this.cameras.main.centerX, 250, String(this.countdown), {
        fontFamily: 'monospace', fontSize: '96px', color: '#ffd166', stroke: '#100d25', strokeThickness: 10,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(20);
    } else this.countdownText.setText(String(this.countdown));
  }

  private beginOnlineRunning() {
    if (this.matchState === 'RUNNING') return;
    this.countdown = 0;
    this.countdownText?.destroy();
    this.countdownText = undefined;
    this.matchState = 'RUNNING';
    this.cameraController.start();
    this.publishSnapshot(true);
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer) {
    const eventTarget = pointer.event?.target;
    if (!this.local || !pointer.leftButtonDown() || !canAttemptPlayerShove(this.matchState, this.local.snapshot.state, eventTarget instanceof HTMLCanvasElement)) return;
    this.attemptPlayerShove();
  }

  private positionedShovePlayer(player: PlayerRuntime): PositionedShovePlayer {
    return { id: player.snapshot.id, state: player.snapshot.state, x: player.sprite.x, y: player.sprite.y };
  }

  private attemptPlayerShove() {
    if (!this.shoveController.isReady(this.time.now)) return;
    const source = this.positionedShovePlayer(this.local);
    const targetPosition = findShoveTarget(source, this.players.map((player) => this.positionedShovePlayer(player)), this.local.facing, gameplayConfig.shove);
    if (!targetPosition) return;
    const target = this.players.find((player) => player.snapshot.id === targetPosition.id);
    if (!target || !this.shoveController.markApplied(this.time.now)) return;

    if (this.transport.mode === 'online') {
      this.transport.requestShove(this.networkRoundId, target.snapshot.id, ++this.inputSequence);
      return;
    }

    const velocityX = shoveVelocityAwayFrom(source, targetPosition, gameplayConfig.shove.horizontalVelocity);
    target.sprite
      .setAccelerationX(0)
      .setMaxVelocity(Math.max(gameplayConfig.shove.horizontalVelocity, gameplayConfig.player.maxRunSpeed), gameplayConfig.player.maximumFallSpeed)
      .setVelocityX(velocityX);
    beginHitStun(target.hitState, this.time.now, gameplayConfig.shove.hitStunMs);
    this.transport.sendShove({ sequence: ++this.inputSequence, clientTime: Date.now() });
  }

  private startCountdown() {
    if (this.matchState !== 'WAITING') return;
    this.matchState = 'COUNTDOWN';
    this.countdown = 3;
    this.publishSnapshot(true);
    this.countdownText = this.add.text(this.cameras.main.centerX, 250, '3', { fontFamily: 'monospace', fontSize: '96px', color: '#ffd166', stroke: '#100d25', strokeThickness: 10 }).setOrigin(0.5).setScrollFactor(0).setDepth(20);
    this.time.addEvent({ delay: 1000, repeat: 2, callback: () => {
      this.countdown -= 1;
      this.countdownText?.setText(this.countdown > 0 ? String(this.countdown) : 'BAŞLA!');
      this.publishSnapshot(true);
      if (this.countdown === 0) {
        this.time.delayedCall(450, () => { this.countdownText?.destroy(); this.countdownText = undefined; });
        this.matchState = 'RUNNING'; this.cameraController.start(); this.publishSnapshot(true);
      }
    }});
  }

  private updateLocal(time: number, delta: number) {
    const player = this.local;
    if (player.snapshot.state !== 'ACTIVE' && player.snapshot.state !== 'INVULNERABLE') { player.sprite.setVelocityX(0); return; }
    const body = player.sprite.body as Phaser.Physics.Arcade.Body;
    // Dynamic player contacts set touching.down; only terrain may grant grounded/jump state.
    const grounded = updateGroundedState(player.jumpState, time, body.blocked.down, false);
    const left = this.cursors.left.isDown || this.keys.a.isDown;
    const right = this.cursors.right.isDown || this.keys.d.isDown;
    const jumpDown = Phaser.Input.Keyboard.JustDown(this.cursors.up) || Phaser.Input.Keyboard.JustDown(this.cursors.space) || Phaser.Input.Keyboard.JustDown(this.keys.w);
    if (jumpDown) recordJumpPress(player.jumpState, time);
    const jumpReleased = Phaser.Input.Keyboard.JustUp(this.cursors.up) || Phaser.Input.Keyboard.JustUp(this.cursors.space) || Phaser.Input.Keyboard.JustUp(this.keys.w);
    const direction = this.developmentMoveDirection || Number(right) - Number(left);
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
    if (this.transport.mode === 'standalone')
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
    return !(this.mapGenerator?.activeChunks.some((chunk) => chunk.platforms.some((platform) => platform.mandatory && x + 55 >= platform.x && x + 55 <= platform.x + platform.width)) ?? false);
  }

  private updatePlayers(time: number) {
    for (const player of this.players) {
      const hadHitStun = Number.isFinite(player.hitState.hitStunEndsAt);
      if (!updateHitStun(player.hitState, time) && hadHitStun && player.sprite.active) player.sprite.clearTint();
      if (player.snapshot.state === 'INVULNERABLE' && time >= player.invulnerableUntil) {
        this.setPlayerState(player, 'ACTIVE'); player.sprite.clearTint().setAlpha(1);
      } else if (player.snapshot.state === 'INVULNERABLE') player.sprite.setAlpha(Math.floor(time / 100) % 2 ? 0.4 : 1);
      if (player.snapshot.state !== 'ACTIVE' || (this.transport.mode === 'online' && !player.snapshot.isLocal)) continue;
      const body = player.sprite.body as Phaser.Physics.Arcade.Body;
      if (player.sprite.y > sampleMap.height + 40 || isBehindCamera(body.right, this.cameraController.dangerX(this.cameras.main))) this.eliminate(player);
    }
  }

  private eliminate(player: PlayerRuntime) {
    if (this.transport.mode === 'online') {
      if (!player.snapshot.isLocal || this.eliminationPending) return;
      this.eliminationPending = true;
      this.transport.requestPlayerElimination(this.networkRoundId);
      return;
    }
    resetHitStun(player.hitState);
    player.snapshot = { ...player.snapshot, state: transitionPlayer(player.snapshot.state, 'FALLEN'), eliminations: player.snapshot.eliminations + 1 };
    player.sprite.disableBody(true, true); player.label.setVisible(false);
    if (player.snapshot.isLocal) {
      this.setPlayerState(player, 'ANSWERING_QUESTION');
      const questions = this.questionPool.length > 0 ? this.questionPool : retroQuestions;
      const question = questions[this.questionIndex++ % questions.length]!;
      this.activeQuestionId = question.id;
      this.bridge.emit('questionOpened', { ...question, canConfirm: true });
      this.bridge.emit('announcement', 'Retrospektif sorusunu sözlü olarak yanıtla');
    }
    this.publishSnapshot(true);
  }

  private handleQuestionAnswered(questionId: string) {
    if (this.local.snapshot.state !== 'ANSWERING_QUESTION' || questionId !== this.activeQuestionId) return;
    if (this.transport.mode === 'online') {
      this.transport.completeQuestion(this.networkRoundId, questionId);
      return;
    }
    this.resetRound();
  }

  private resetRound() {
    this.matchState = 'WAITING';
    this.time.removeAllEvents();
    this.countdownText?.destroy();
    this.countdownText = undefined;
    this.elapsedMs = 0;
    this.countdown = 3;
    this.activeQuestionId = null;
    this.activeOnlineQuestion = null;
    this.targetProtectedUntil = {};
    this.abilityController.reset();
    this.shoveController.reset();
    this.random.reset(20260806);
    this.cameraController.reset(this.cameras.main);

    for (const child of this.rockets.getChildren()) child.destroy();
    this.rocketsToDispose.clear();
    for (const effect of this.temporaryEffects) {
      this.tweens.killTweensOf(effect);
      effect.destroy();
    }
    this.temporaryEffects.clear();

    this.destroyProceduralMap();
    this.createProceduralMap();

    this.players.forEach((player) => {
      player.snapshot = resetPlayerSnapshotForRound(player.snapshot);
      player.facing = 1;
      player.invulnerableUntil = 0;
      player.speedUntil = 0;
      player.botJumpAt = 0;
      resetJumpState(player.jumpState);
      resetHitStun(player.hitState);
      player.sprite
        .enableBody(true, player.spawn.x, player.spawn.y, true, true)
        .setAcceleration(0, 0)
        .setVelocity(0, 0)
        .setMaxVelocity(gameplayConfig.player.maxRunSpeed, gameplayConfig.player.maximumFallSpeed)
        .setTint(0xffffff)
        .setAlpha(1)
        .setAngle(0)
        .setScale(1)
        .setFlipX(false);
      player.label.setVisible(true).setPosition(player.spawn.x, player.spawn.y - 44);
    });

    const warning = this.children.getByName('danger-warning') as Phaser.GameObjects.Rectangle | null;
    warning?.setX(this.cameraController.dangerX(this.cameras.main));
    this.bridge.emit('roundReset', undefined);
    this.publishSnapshot(true);
    this.startCountdown();
  }

  private useAbility(id: AbilityId) {
    if (this.matchState !== 'RUNNING' || !['ACTIVE', 'INVULNERABLE'].includes(this.local.snapshot.state)) return;
    if (!this.abilityController.isOwned(id)) return;
    const now = this.time.now;
    if (!this.abilityController.isReady(id, now)) { this.bridge.emit('announcement', 'Bu yetenek henüz yeniden doluyor'); return; }
    const rocketTarget = id === 'rocket' ? this.findRocketTarget(this.local) : undefined;
    if (id === 'rocket' && !rocketTarget) { this.bridge.emit('announcement', 'Yakında uygun hedef yok'); return; }
    if (!this.abilityController.tryUse(id, now)) return;
    this.transport.useAbility({ abilityId: id, direction: this.local.facing, clientTime: Date.now() });
    this.audio.play('ability');
    if (id === 'speed') { this.local.speedUntil = now + 3_000; this.local.sprite.setTint(0xfff1a8); }
    if (id === 'rocket' && rocketTarget) {
      if (this.transport.mode === 'online') this.transport.requestRocketFire(this.networkRoundId);
      else this.fireRocket(this.local, rocketTarget);
    }
    if (id === 'ask') this.bridge.emit('targetSelectionOpened', { protectedTargets: this.targetProtectedUntil });
    this.publishSnapshot(true);
  }

  private fireRocket(owner: PlayerRuntime, target: PlayerRuntime) {
    this.spawnRocket(`local-${++this.inputSequence}`, owner, target, owner.sprite.x + owner.facing * 35, owner.sprite.y, 0);
  }

  private spawnOnlineRocket(networkRocket: RetroRushRocketSnapshot) {
    if (networkRocket.roundId !== this.networkRoundId || this.findRocket(networkRocket.rocketId)) return;
    const owner = this.playersById.get(networkRocket.ownerPlayerId);
    const target = this.playersById.get(networkRocket.targetPlayerId);
    if (!owner || !target) return;
    this.spawnRocket(networkRocket.rocketId, owner, target, networkRocket.x, networkRocket.y, networkRocket.roundId);
  }

  private spawnRocket(rocketId: string, owner: PlayerRuntime, target: PlayerRuntime, x: number, y: number, roundId: number) {
    const rocket = this.rockets.create(x, y, 'rocket') as Phaser.Physics.Arcade.Sprite;
    const velocity = velocityTowards(rocket, target.sprite, gameplayConfig.rocket.speed, owner.facing);
    rocket.setData('rocketId', rocketId).setData('roundId', roundId).setData('ownerId', owner.snapshot.id).setData('targetId', target.snapshot.id).setData('state', 'ACTIVE' satisfies RocketState).setData('previousX', rocket.x).setData('previousY', rocket.y).setData('hitPending', false).setVelocity(velocity.x, velocity.y).setFlipX(velocity.x < 0);
    const body = rocket.body as Phaser.Physics.Arcade.Body;
    body.setSize(gameplayConfig.rocket.collisionWidth, gameplayConfig.rocket.collisionHeight, false).setOffset(gameplayConfig.rocket.collisionOffsetX, gameplayConfig.rocket.collisionOffsetY);
    this.audio.play('rocket');
    this.showRocketWarning(target);
    this.time.delayedCall(gameplayConfig.rocket.lifetimeMs, () => this.resolveRocket(rocket, 'EXPIRED'));
  }

  private findRocket(rocketId: string) {
    return this.rockets.getChildren().find((child) => (child as Phaser.Physics.Arcade.Sprite).getData('rocketId') === rocketId) as Phaser.Physics.Arcade.Sprite | undefined;
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
        if (this.transport.mode === 'online') continue;
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
    const marker = this.trackTemporaryEffect(this.add.text(target.sprite.x, target.sprite.y - 76, '!', { fontFamily: 'monospace', fontSize: '28px', color: '#ff4d6d', stroke: '#100d25', strokeThickness: 5 }).setOrigin(0.5).setDepth(10));
    this.tweens.add({ targets: marker, alpha: 0, y: marker.y - 12, duration: 650, onComplete: () => this.destroyTemporaryEffect(marker) });
  }

  private tryCollectPickup(player: PlayerRuntime, pickup: PickupRuntime) {
    if (!player.snapshot.isLocal || player.snapshot.state !== 'ACTIVE' || !pickup.active) return;
    if (this.transport.mode === 'online') {
      if (pickup.pending || this.collectedPickupIds.has(pickup.id)) return;
      pickup.pending = true;
      this.transport.requestPickupCollection(this.networkRoundId, pickup.id, pickup.ability);
      return;
    }
    if (!collectPickup(pickup)) return;
    const body = pickup.zone.body as Phaser.Physics.Arcade.StaticBody;
    body.enable = false;
    pickup.visuals.forEach((visual) => visual.setVisible(false).setActive(false));
    this.abilityController.grant(pickup.ability);
    if (player.snapshot.isLocal) {
      const pickupName = pickup.ability === 'speed' ? 'İvme' : pickup.ability === 'rocket' ? 'İtme roketi' : 'Soru';
      this.bridge.emit('announcement', `${pickupName} hazır`);
    }
    this.publishSnapshot(true);
  }

  private hitByRocket(rocket: Phaser.Physics.Arcade.Sprite, target: PlayerRuntime) {
    const ownerId = String(rocket.getData('ownerId'));
    if (this.transport.mode === 'online') {
      if (ownerId !== this.transport.localPlayerId || rocket.getData('targetId') !== target.snapshot.id || rocket.getData('hitPending')) return;
      const rocketId = String(rocket.getData('rocketId'));
      rocket.setData('hitPending', true);
      this.transport.requestRocketHit(this.networkRoundId, rocketId);
      return;
    }
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

  private applyOnlineRocketHit(hit: RetroRushRocketHitApplied) {
    if (hit.roundId !== this.networkRoundId || this.resolvedRocketIds.has(hit.rocketId)) return;
    this.resolvedRocketIds.add(hit.rocketId);
    const rocket = this.findRocket(hit.rocketId);
    if (rocket) {
      rocket.setData('state', 'HIT' satisfies RocketState);
      const body = rocket.body as Phaser.Physics.Arcade.Body | null;
      body?.stop();
      body?.setEnable(false);
      this.queueRocketDisposal(rocket);
    }
    const target = this.playersById.get(hit.targetPlayerId);
    if (!target || !target.snapshot.isLocal) return;
    const targetBody = target.sprite.body as Phaser.Physics.Arcade.Body;
    // The server contract is authoritative and always supplies the fixed LEFT value.
    const velocity = fixedLeftKnockbackVelocity(targetBody.velocity.y, hit.velocityX);
    target.sprite.setAccelerationX(0)
      .setMaxVelocity(Math.max(Math.abs(hit.velocityX), gameplayConfig.player.maxRunSpeed), gameplayConfig.player.maximumFallSpeed)
      .setVelocity(velocity.x, velocity.y).setTint(0xffffff);
    beginHitStun(target.hitState, this.time.now, hit.hitStunMs);
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
      const burst = this.trackTemporaryEffect(this.add.circle(rocket.x, rocket.y, 7, forestPalette.lantern, 0.8).setDepth(8));
      this.tweens.add({ targets: burst, scale: 4, alpha: 0, duration: 180, onComplete: () => this.destroyTemporaryEffect(burst) });
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
      this.bridge.emit('announcement', 'Bu ekip arkadaşı şu anda kullanılamıyor'); return;
    }
    this.targetProtectedUntil[playerId] = Date.now() + 20_000;
    this.transport.selectAbilityTarget({ abilityId: 'ask', targetPlayerId: playerId, clientTime: Date.now() });
    if (this.transport.mode === 'online') return;
    this.showTargetQuestion(playerId);
  }

  private applyOnlineTargetQuestion(roundId: number, sourcePlayerId: string, targetPlayerId: string) {
    if (roundId !== this.networkRoundId || !this.playersById.has(sourcePlayerId)) return;
    this.showTargetQuestion(targetPlayerId);
  }

  private showTargetQuestion(playerId: string) {
    const target = this.playersById.get(playerId) ?? this.players.find((player) => player.snapshot.id === playerId);
    if (!target) return;
    const marker = this.trackTemporaryEffect(this.add.text(target.sprite.x, target.sprite.y - 82, '?', { fontFamily: 'monospace', fontSize: '36px', color: '#ffd166', stroke: '#100d25', strokeThickness: 6 }).setOrigin(0.5).setDepth(9));
    this.tweens.add({ targets: marker, y: marker.y - 28, alpha: 0, duration: 1_600, onComplete: () => this.destroyTemporaryEffect(marker) });
    this.bridge.emit('announcement', `${target.snapshot.name} adlı oyuncuya değerlendirme sorusu geldi`);
  }

  private updateLabels() {
    for (const player of this.players) {
      player.label.setPosition(player.sprite.x, player.sprite.y - 44);
      if (!player.sprite.visible) continue;
      const body = player.sprite.body as Phaser.Physics.Arcade.Body;
      this.characterVisuals.update(player.sprite, player.skinIndex, body.velocity.x, body.velocity.y, body.blocked.down);
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
    this.bridge.emit('snapshot', {
      state: this.matchState,
      timeRemainingMs: Math.max(0, gameplayConfig.world.matchDurationMs - this.elapsedMs),
      countdown: this.countdown,
      players: this.players.map((player) => ({ ...player.snapshot })),
      checkpointLabel: 'Başlangıç Noktası',
      danger: this.local ? this.local.sprite.x < this.cameraController.dangerX(this.cameras.main) + 220 : false,
      ownedAbilities: this.abilityController.ownedAbilities(),
      cooldowns: this.abilityController.cooldowns(this.time.now),
    });
  }

  private sendNetworkSnapshot(deltaMs: number) {
    if (!this.local || this.networkRoundId === 0 || this.local.snapshot.state === 'DISCONNECTED') return;
    this.networkSendAccumulatorMs += deltaMs;
    const intervalMs = 1_000 / gameplayConfig.network.sendRateHz;
    if (this.networkSendAccumulatorMs < intervalMs) return;
    this.networkSendAccumulatorMs %= intervalMs;
    const body = this.local.sprite.body as Phaser.Physics.Arcade.Body;
    const animationState: RetroRushPlayerSnapshot['animationState'] = isInHitStun(this.local.hitState, this.time.now)
      ? 'hit'
      : body.velocity.y < -30 ? 'jumping'
      : body.velocity.y > 60 ? 'falling'
      : Math.abs(body.velocity.x) > 25 ? 'running' : 'idle';
    this.transport.sendPlayerSnapshot({
      playerId: this.local.snapshot.id,
      displayName: this.local.snapshot.name,
      color: `#${this.local.snapshot.color.toString(16).padStart(6, '0')}`,
      slot: this.local.slot,
      skinIndex: this.local.skinIndex,
      connected: true,
      x: this.local.sprite.x,
      y: this.local.sprite.y,
      velocityX: body.velocity.x,
      velocityY: body.velocity.y,
      facing: this.local.facing < 0 ? 'left' : 'right',
      movementState: this.local.snapshot.state,
      animationState,
      sequence: ++this.networkSequence,
      clientTimestamp: Date.now(),
      roundId: this.networkRoundId,
      ownedAbilityIds: this.abilityController.ownedAbilities(),
    });
    this.networkSnapshotsSent++;
  }

  private setPlayerState(player: PlayerRuntime, next: PlayerState) {
    player.snapshot = { ...player.snapshot, state: transitionPlayer(player.snapshot.state, next) };
  }

  private trackTemporaryEffect<T extends Phaser.GameObjects.GameObject>(effect: T) {
    this.temporaryEffects.add(effect);
    return effect;
  }

  private destroyTemporaryEffect(effect: Phaser.GameObjects.GameObject) {
    this.temporaryEffects.delete(effect);
    if (effect.active) effect.destroy();
  }
}
