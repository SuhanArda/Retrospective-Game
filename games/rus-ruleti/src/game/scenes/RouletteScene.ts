import Phaser from 'phaser';
import type { FireAnimationEvent, RouletteBridgeState, RouletteRoomBridge } from '../../app/roomBridge';
import type { RouletteSeat } from '../../app/seats';

interface Seat {
  id: string;
  name: string;
  /** Which of the 13 generated character sprites this seat wears. */
  sprite: string;
  isYou?: boolean;
}

/**
 * Standalone-demo roster, used only when this scene is opened with no room
 * bridge (nobody launched it from a real room). One fixed sprite per name so
 * re-loading the page keeps everyone recognizable.
 */
const SAMPLE_OPPONENTS: readonly Seat[] = [
  { id: 'ada', name: 'Ada', sprite: 'char-01' },
  { id: 'mert', name: 'Mert', sprite: 'char-02' },
  { id: 'ece', name: 'Ece', sprite: 'char-03' },
  { id: 'suha', name: 'Suha', sprite: 'char-04' },
  { id: 'deniz', name: 'Deniz', sprite: 'char-05' },
  { id: 'kaan', name: 'Kaan', sprite: 'char-06' },
  { id: 'zeynep', name: 'Zeynep', sprite: 'char-07' },
  { id: 'bora', name: 'Bora', sprite: 'char-08' },
];

const MIN_CHAMBERS = 5;
const MAX_CHAMBERS = 12;
const NPC_THINK_MS = 1100;
const REVEAL_TRAVEL_MS = 380;
const MISS_PAUSE_MS = 650;
const FIRE_FLASH_MS = 220;
const GUN_SMOKE_MS = 260;

/**
 * The gun art itself isn't drawn pointing straight right — measured from the
 * grip to the muzzle tip in gun-idle.png, it's drawn at roughly this angle
 * above horizontal. Aiming has to subtract this out, or "rotate to face the
 * target" would be off by this much.
 */
const GUN_ART_ANGLE = Phaser.Math.DEG_TO_RAD * -32.8;

/** Roughly the grip-to-muzzle distance at the gun's display scale, so a fired bullet starts from the barrel tip, not the hand. */
const GUN_BARREL_LENGTH = 50;

/** The gun's resting display scale — kept as a named constant because aiming left mirrors it by negating scaleX (see aimGun), not by rotating past vertical. */
const GUN_SCALE = 0.24;
const QUESTION_REVEAL_DELAY_MS = 300;

/** Campfire centerpiece: how long each of its 6 frames holds before advancing, and how wide it reads on screen. */
const CAMPFIRE_FRAME_MS = 180;
const CAMPFIRE_DISPLAY_WIDTH = 100;

/**
 * Both ambient beds loop for the whole scene, quiet enough to stay in the
 * background rather than compete with dialogue. Each one's volume drifts up
 * and down on its own cycle (different duration, offset start) so the two
 * never swell together — sometimes the fire reads louder, sometimes the
 * birds do, the way an outdoor ambience actually shifts instead of sitting
 * at a fixed mix.
 */
const AMBIENT_FIRE_VOLUME_RANGE: readonly [number, number] = [0.02, 0.06];
const AMBIENT_FIRE_CYCLE_MS = 14000;
const AMBIENT_BIRDS_VOLUME_RANGE: readonly [number, number] = [0.03, 0.09];
const AMBIENT_BIRDS_CYCLE_MS = 19000;
const AMBIENT_BIRDS_START_DELAY_MS = 4000;
const GUNSHOT_VOLUME = 0.95;
const MISS_CLICK_VOLUME = 0.75;

/** Only used standalone — an online room's questions come from the server, never invented here. */
const SAMPLE_QUESTIONS = [
  'Bu sprintte seni en çok ne yordu?',
  'Takımdan en çok neye güvendin?',
  'Hangi kararı bir daha alsan farklı alırdın?',
  'Bu dönem kimden ne öğrendin?',
  'Önümüzdeki sprintte neyi değiştirmek istersin?',
];

/** Every generated character sprite's displayed height, before the crowd shrink factor. */
const CHARACTER_TARGET_HEIGHT = 140;

/**
 * The row sits on an actual circle, not a flat line with a bit of bow — take
 * a circle, cut it in half, and this is the top half of it: the center seat
 * is the far/back point (like someone standing across a campfire from you),
 * and the row sweeps down and out toward the two ends (like the seats
 * nearest your own place at the circle). ROW_ARC_SPAN_DEG is how much of
 * that circle's circumference the row covers — wider means a deeper dome.
 * ROW_HALF_WIDTH is how far the two ends land from centerX; the circle's
 * radius is derived from these two so the row always spans the same width
 * regardless of how many people are seated.
 */
const ROW_ARC_SPAN_DEG = 90;
const ROW_HALF_WIDTH = 340;

interface SeatVisual {
  seat: Seat;
  x: number;
  y: number;
  baseScale: number;
  displayWidth: number;
  displayHeight: number;
  container: Phaser.GameObjects.Container;
  ring: Phaser.GameObjects.Graphics;
}

/**
 * Everyone — including "Sen" (you), always the leftmost seat — stands in
 * one row, drawn front-on rather than viewed from above; who you are is
 * shown in the sidebar (the room roster), not by a separate box in the
 * scene. The row sits on the top half of a circle — the center person
 * farthest back, the row curving down and out toward the ends — like a
 * group gathered around a shared center point, which is where the campfire
 * centerpiece sits.
 *
 * Runs in one of two modes, decided once at construction:
 *  - No bridge: a self-contained local demo against bots — this scene owns
 *    the cylinder (bullet chamber, pointer) and decides everything itself.
 *  - A bridge: every decision (who holds the gun, hit or miss, the
 *    question) comes from the server via the bridge's events. This scene
 *    only ever asks to fire and animates whatever it's told happened —
 *    never computes a result itself, the same way a client can't be trusted
 *    with the bullet's position.
 */
export class RouletteScene extends Phaser.Scene {
  private readonly isOnline: boolean;
  private readonly players: readonly Seat[];
  private readonly localPlayerId: string;

  private centerX = 0;
  private centerY = 0;
  private rowY = 0;
  private seatVisuals = new Map<string, SeatVisual>();
  private gun!: Phaser.GameObjects.Image;
  private turnBanner!: Phaser.GameObjects.Text;
  private turnBannerBackdrop!: Phaser.GameObjects.Graphics;
  private ambientFire!: Phaser.Sound.BaseSound;
  private ambientBirds!: Phaser.Sound.BaseSound;
  private questionPanel!: Phaser.GameObjects.Container;
  private questionText!: Phaser.GameObjects.Text;
  private completeButton!: Phaser.GameObjects.Text;

  private holderId = '';
  private busy = false;
  private pendingTargetId = '';
  private readonly disposers: Array<() => void> = [];

  // Standalone-only cylinder state. An online room never lets the client see
  // (or compute) any of this — see RouletteRoomBridge / the server's own copy.
  private chambers = MIN_CHAMBERS;
  private bulletChamber = 0;
  private chamberPointer = 0;
  // Online-only: the server's last-known status, gating whether firing is even allowed right now.
  private bridgeStatus: 'IDLE' | 'QUESTION_ACTIVE' = 'IDLE';

  constructor(
    private readonly bridge: RouletteRoomBridge | null,
    opponents: readonly RouletteSeat[] | null,
    localPlayerId: string | null,
    youSprite: string | null,
  ) {
    super({ key: 'RouletteScene' });
    this.isOnline = bridge !== null;
    if (this.isOnline) {
      this.localPlayerId = localPlayerId!;
      // youSprite is already resolved against this same room's opponents (see seats.ts), so it can't collide with one of them.
      const you: Seat = { id: this.localPlayerId, name: 'Sen', sprite: youSprite!, isYou: true };
      const drawnOpponents: Seat[] = (opponents ?? []).map((seat) => ({ id: seat.id, name: seat.name, sprite: seat.sprite }));
      this.players = [you, ...drawnOpponents];
    } else {
      this.localPlayerId = 'you';
      // Fixed and outside char-01..08 on purpose — SAMPLE_OPPONENTS already claims that range, and this roster never changes, so there's no collision to resolve.
      this.players = [{ id: 'you', name: 'Sen', sprite: 'char-09', isYou: true }, ...SAMPLE_OPPONENTS];
    }
  }

  preload() {
    this.load.image('stage-background', '/background.png');
    this.load.image('bullet', '/bullet.png');
    for (const seat of this.players) this.load.image(seat.sprite, `/sprites/characters/${seat.sprite}.png`);
    this.load.image('gun-idle', '/sprites/gun/gun-idle.png');
    this.load.image('gun-fire', '/sprites/gun/gun-fire.png');
    this.load.image('gun-smoke', '/sprites/gun/gun-smoke.png');
    for (let i = 1; i <= 6; i++) this.load.image(`fire${i}`, `/sprites/fire/fire${i}.png`);
    this.load.audio('ambient-fire', '/sounds/fireLoop.wav');
    this.load.audio('ambient-birds', '/sounds/bacgroundBirds.wav');
    this.load.audio('gun-shoot', '/sounds/gunShoot.wav');
    this.load.audio('gun-miss', '/sounds/playMissPuff.ogg');
  }

  create() {
    const { width, height } = this.scale;
    this.centerX = width / 2;
    this.centerY = height / 2 - 10;
    // Pixel-sampling this dappled forest floor kept landing short of where
    // it actually reads as "standing on the ground" — Bahadır marked the
    // real line by hand, closer to the bottom of the frame than any of that
    // measuring found.
    this.rowY = Math.round(height * 0.87);

    // Phaser's WebAudio sound manager suspends its whole AudioContext on
    // window blur by default and resumes it on focus. Screen-sharing this
    // game in a Teams/Meet call triggers blur constantly (clicking the
    // meeting controls, a notification, alt-tabbing) — every one of those
    // was cutting the audio out and back in. Table games like this one have
    // no gameplay reason to punish an unfocused tab, so just leave audio
    // running regardless of window focus.
    this.sound.pauseOnBlur = false;

    this.drawBackground();
    this.buildSeats();
    this.buildCampfire();
    this.buildTurnBanner();
    this.buildGun();
    this.buildQuestionPanel();
    this.buildAmbientAudio();

    if (this.isOnline) {
      this.setTurnBannerText('Bağlanıyor...');
      this.disposers.push(
        this.bridge!.onStateChanged((state) => this.applyBridgeState(state)),
        this.bridge!.onFireResult((event) => this.applyFireResult(event)),
      );
      // Phaser calls preload/create/update by name, but shutdown/destroy are
      // events on the scene's own emitter, not overridable methods.
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.disposers.forEach((dispose) => dispose()));
      this.events.once(Phaser.Scenes.Events.DESTROY, () => this.disposers.forEach((dispose) => dispose()));
    } else {
      // Not equal to players.length on purpose (see the field's comment),
      // but scaled so a 2-person table and an 8-person table don't share odds.
      this.chambers = Phaser.Math.Clamp(this.players.length + Phaser.Math.Between(-1, 3), MIN_CHAMBERS, MAX_CHAMBERS);
      this.resetCylinder();
      this.holderId = Phaser.Math.RND.pick([...this.players]).id;
      this.setHolder(this.holderId, true);
    }
  }

  // ---- static dressing ----

  private drawBackground() {
    this.addCoverLayer('stage-background', -20);
    // A centerpiece belongs here — depth 8, grounded at the row's feet —
    // once the campfire art replaces the table this used to be.
  }

  /** Scales a full-bleed layer to cover the canvas without stretching/distorting it. */
  private addCoverLayer(key: string, depth: number) {
    const { width, height } = this.scale;
    const image = this.add.image(width / 2, height / 2, key).setDepth(depth);
    image.setScale(Math.max(width / image.width, height / image.height));
    return image;
  }

  // ---- seats ----

  /**
   * Seated on the top half of a circle (see ROW_ARC_SPAN_DEG's comment):
   * the center person sits highest and farthest back, the two ends come
   * down and out toward rowY, the ground line. As more people join, spacing
   * shrinks — once it gets tighter than a character comfortably needs, the
   * figures themselves shrink too, rather than overlapping. "Sen" sits in
   * this same row now, in the same array position players is built in
   * (leftmost) — no separate portrait, no special sizing.
   */
  private buildSeats() {
    const n = this.players.length;
    const comfortableSpacing = 115;
    const idealSpacing = n > 1 ? (2 * ROW_HALF_WIDTH) / (n - 1) : 2 * ROW_HALF_WIDTH;
    const crowdScale = n > 1 ? Phaser.Math.Clamp(idealSpacing / comfortableSpacing, 0.55, 1) : 1;

    const halfAngle = Phaser.Math.DegToRad(ROW_ARC_SPAN_DEG / 2);
    const radius = ROW_HALF_WIDTH / Math.sin(halfAngle);

    this.players.forEach((seat, i) => {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const angle = Phaser.Math.Linear(-halfAngle, halfAngle, t);
      const x = this.centerX + radius * Math.sin(angle);
      const y = this.rowY - radius * (Math.cos(angle) - Math.cos(halfAngle));
      this.buildSeatVisual(seat, x, y, crowdScale);
    });
  }

  private buildSeatVisual(seat: Seat, x: number, y: number, crowdScale: number) {
    const container = this.add.container(x, y).setDepth(5).setScale(crowdScale);

    const figure = this.add.image(0, 0, seat.sprite).setOrigin(0.5, 1);
    const intrinsicScale = CHARACTER_TARGET_HEIGHT / figure.height;
    figure.setScale(intrinsicScale);

    const displayWidth = figure.width * intrinsicScale;
    const displayHeight = figure.height * intrinsicScale;

    // A soft contact shadow at the feet, plus a dark rim just outside the
    // figure's own silhouette — without them, characters read as faint,
    // since nothing separates their edges from a background that's textured
    // at a similar brightness. The rim is just the same sprite, tinted black
    // and scaled a hair larger, sitting directly behind the real figure.
    const shadow = this.add.ellipse(0, -4, displayWidth * 0.75, displayHeight * 0.18, 0x000000, 0.45);
    const rim = this.add.image(0, 0, seat.sprite).setOrigin(0.5, 1).setScale(intrinsicScale * 1.05).setTint(0x000000).setAlpha(0.6);
    container.add([shadow, rim, figure]);

    const ring = this.add.graphics();
    container.addAt(ring, 2);

    // Above the head, not below the feet — leaves room for a centerpiece (a table, eventually a campfire) to sit in front of the row without covering names.
    const label = this.add
      .text(0, -displayHeight - 14, seat.name, { fontFamily: 'monospace', fontSize: '12px', color: '#fff0ce', stroke: '#2c2227', strokeThickness: 2 })
      .setOrigin(0.5);
    container.add(label);

    const hitZone = this.add.zone(0, -displayHeight / 2, displayWidth, displayHeight).setInteractive({ useHandCursor: true });
    hitZone.on('pointerover', () => { if (this.canTarget(seat.id)) container.setScale(crowdScale * 1.06); });
    hitZone.on('pointerout', () => container.setScale(crowdScale));
    hitZone.on('pointerdown', () => { if (this.canTarget(seat.id)) this.playerFires(seat.id); });
    container.add(hitZone);

    this.seatVisuals.set(seat.id, { seat, x, y, baseScale: crowdScale, displayWidth, displayHeight, container, ring });
  }

  /**
   * The centerpiece the row gathers around — horizontally at the row's own
   * center, grounded a touch past rowY (in front of the feet, not behind
   * them), and above the characters in depth so it reads as sitting closer
   * to camera than they are, the same role the table used to play.
   */
  private buildCampfire() {
    this.anims.create({
      key: 'campfire-burn',
      frames: Array.from({ length: 6 }, (_, i) => ({ key: `fire${i + 1}` })),
      frameRate: 1000 / CAMPFIRE_FRAME_MS,
      repeat: -1,
    });

    const fire = this.add.sprite(this.centerX, this.rowY + 10, 'fire1').setOrigin(0.5, 1).setDepth(8);
    fire.setScale(CAMPFIRE_DISPLAY_WIDTH / fire.width);
    fire.play('campfire-burn');
  }

  private buildTurnBanner() {
    // The game area's CSS box is rarely a perfect 960:640 (the sidebar and
    // the player's actual window size both push it around), and it's
    // covered rather than letterboxed — so whichever edge ends up tighter
    // gets cropped. 64px clears that in any reasonable window; 40px didn't.
    this.turnBannerBackdrop = this.add.graphics().setDepth(19);
    // Deliberately NOT the sidebar's "Press Start 2P" pixel font: that font
    // has no glyph for Turkish ş/ğ, and this banner's text always has both
    // ("Bağlanıyor...", "... nişan alıyor...", player names) — Canvas was
    // rendering the missing glyph as a broken stray mark instead of falling
    // back cleanly. Plain monospace has full Turkish coverage, so this
    // banner loses the pixel-font look but always renders correctly.
    this.turnBanner = this.add
      .text(this.centerX, 64, '', {
        fontFamily: 'monospace', fontSize: '13px', color: '#fff0ce',
      })
      .setOrigin(0.5)
      .setDepth(20);
  }

  /** Sets the banner text and resizes its backdrop panel to fit — same dark-fill, gold-border language as the question panel, instead of bare text floating over the scene. */
  private setTurnBannerText(text: string) {
    this.turnBanner.setText(text);
    const paddingX = 22;
    const paddingY = 14;
    const w = this.turnBanner.width + paddingX * 2;
    const h = this.turnBanner.height + paddingY * 2;
    this.turnBannerBackdrop.clear();
    this.turnBannerBackdrop.fillStyle(0x241014, 0.88).fillRoundedRect(this.centerX - w / 2, 64 - h / 2, w, h, 14);
    this.turnBannerBackdrop.lineStyle(3, 0xd9a441, 1).strokeRoundedRect(this.centerX - w / 2, 64 - h / 2, w, h, 14);
  }

  private buildGun() {
    // The three frames share one canvas (see the asset pipeline notes), so
    // swapping textures never shifts the gun — same scale works for all three.
    // Origin sits at the grip (measured from gun-idle.png), not the image
    // center, so rotating it swings the barrel around the hand instead of
    // swinging the whole gun away from whoever's holding it.
    this.gun = this.add.image(this.centerX, this.centerY, 'gun-idle').setDepth(15).setScale(GUN_SCALE).setOrigin(0.1, 0.95);
  }

  private setGunFrame(key: 'gun-idle' | 'gun-fire' | 'gun-smoke') {
    this.gun.setTexture(key);
  }

  /**
   * Rotates (and, past ±90° from straight right, mirrors) the gun so its
   * muzzle points at `angle`. A flat side-view sprite rotated near 180°
   * reads as upside-down, not "facing left" — real hands don't spin a gun
   * through a vertical flip to aim the other way, they turn their wrist —
   * so past that point this mirrors horizontally (negative scaleX, around
   * the same grip-anchored origin, which is why this can't just be
   * Phaser's flipX: that mirrors the texture within the frame, not around
   * a custom origin, and would yank the pivot off the grip) and only
   * rotates back the small remainder.
   */
  private aimGun(angle: number) {
    const facingLeft = Math.cos(angle) < 0;
    this.gun.scaleX = facingLeft ? -GUN_SCALE : GUN_SCALE;
    this.gun.rotation = facingLeft ? angle - Math.PI + GUN_ART_ANGLE : angle - GUN_ART_ANGLE;
  }

  private buildQuestionPanel() {
    this.questionPanel = this.add.container(this.centerX, this.centerY).setDepth(30).setVisible(false);

    const backdrop = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.55).setOrigin(0.5);
    this.questionPanel.add(backdrop);

    const panel = this.add.graphics();
    panel.fillStyle(0x241014, 1).fillRoundedRect(-260, -110, 520, 220, 18);
    panel.lineStyle(4, 0xd9a441, 1).strokeRoundedRect(-260, -110, 520, 220, 18);
    this.questionPanel.add(panel);

    const heading = this.add.text(0, -72, '🔫 BANG!', { fontFamily: 'monospace', fontSize: '22px', fontStyle: 'bold', color: '#ff7da8' }).setOrigin(0.5);
    this.questionPanel.add(heading);

    this.questionText = this.add
      .text(0, -20, '', { fontFamily: 'monospace', fontSize: '17px', color: '#fff0ce', align: 'center', wordWrap: { width: 460 } })
      .setOrigin(0.5);
    this.questionPanel.add(this.questionText);

    this.completeButton = this.add
      .text(0, 70, 'CEVAPLADIM, DEVAM ET', { fontFamily: 'monospace', fontSize: '16px', color: '#2c2227', backgroundColor: '#ffd166', padding: { x: 18, y: 10 } })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    this.completeButton.on('pointerdown', () => this.dismissQuestion());
    this.questionPanel.add(this.completeButton);
  }

  /**
   * Two looping ambience beds, each drifting between a quiet and a slightly-
   * less-quiet volume on its own independent cycle. Different durations
   * (14s vs 19s) and a delayed start for the birds keep the two from ever
   * swelling in lockstep, so which one reads louder keeps shifting instead
   * of settling into a fixed mix.
   */
  private buildAmbientAudio() {
    const [fireMin, fireMax] = AMBIENT_FIRE_VOLUME_RANGE;
    this.ambientFire = this.sound.add('ambient-fire', { loop: true, volume: fireMin });
    this.ambientFire.play();
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: AMBIENT_FIRE_CYCLE_MS,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      onUpdate: (tween) => {
        const t = tween.getValue() ?? 0;
        (this.ambientFire as Phaser.Sound.WebAudioSound).setVolume(Phaser.Math.Linear(fireMin, fireMax, t));
      },
    });

    const [birdsMin, birdsMax] = AMBIENT_BIRDS_VOLUME_RANGE;
    this.ambientBirds = this.sound.add('ambient-birds', { loop: true, volume: birdsMin });
    this.time.delayedCall(AMBIENT_BIRDS_START_DELAY_MS, () => {
      this.ambientBirds.play();
      this.tweens.addCounter({
        from: 0,
        to: 1,
        duration: AMBIENT_BIRDS_CYCLE_MS,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        onUpdate: (tween) => {
          const t = tween.getValue() ?? 0;
          (this.ambientBirds as Phaser.Sound.WebAudioSound).setVolume(Phaser.Math.Linear(birdsMin, birdsMax, t));
        },
      });
    });

    // Browsers block audio until a user gesture; the scene loads before any
    // click happens, so the first play() call above can silently no-op.
    // Resuming (or retrying play) on the sound unlock event catches that.
    this.sound.once(Phaser.Sound.Events.UNLOCKED, () => {
      if (!this.ambientFire.isPlaying) this.ambientFire.play();
      if (!this.ambientBirds.isPlaying && this.time.now >= AMBIENT_BIRDS_START_DELAY_MS) this.ambientBirds.play();
    });
  }

  // ---- standalone-only cylinder state ----

  private resetCylinder() {
    this.bulletChamber = Phaser.Math.Between(0, this.chambers - 1);
    this.chamberPointer = Phaser.Math.Between(0, this.chambers - 1);
  }

  private pullTrigger(): boolean {
    const hit = this.chamberPointer === this.bulletChamber;
    this.chamberPointer = (this.chamberPointer + 1) % this.chambers;
    return hit;
  }

  // ---- turn flow ----

  private canTarget(targetId: string) {
    if (this.busy || this.holderId !== this.localPlayerId || targetId === this.localPlayerId) return false;
    if (this.isOnline && this.bridgeStatus !== 'IDLE') return false;
    return true;
  }

  /** Visual-only: rings, dimming, gun position, and the banner. Shared by both modes. */
  private setHolder(id: string, initial = false) {
    this.holderId = id;
    for (const visual of this.seatVisuals.values()) {
      visual.ring.clear();
      visual.container.setAlpha(visual.seat.isYou || visual.seat.id === id || this.canTarget(visual.seat.id) ? 1 : 0.75);
    }

    const holderVisual = this.seatVisuals.get(id)!;
    this.setGunFrame('gun-idle');
    // The gun's origin is its grip now (see buildGun), not its center, so
    // this only has to clear the character's own edge by a little — the
    // rest of the gun already extends outward from that point on its own.
    this.tweens.add({
      targets: this.gun,
      x: holderVisual.x + holderVisual.displayWidth / 2 + 6,
      y: holderVisual.y - holderVisual.displayHeight * 0.28,
      rotation: 0, // resting pose, until animateFire aims it at whoever gets shot at
      scaleX: GUN_SCALE, // un-mirror, in case the last shot was fired to the left
      duration: initial ? 0 : 420,
      ease: 'Cubic.easeOut',
    });

    this.setTurnBannerText(id === this.localPlayerId ? 'SIRA SENDE — birini seç' : `SIRA: ${holderVisual.seat.name} nişan alıyor...`);

    if (!this.isOnline && id !== this.localPlayerId) this.time.delayedCall(NPC_THINK_MS, () => this.npcFires());
  }

  /** Standalone-only: a bot decides for itself who to shoot. */
  private npcFires() {
    if (this.holderId === this.localPlayerId || this.busy) return;
    const options = this.players.filter((seat) => seat.id !== this.holderId);
    const target = Phaser.Math.RND.pick(options);
    this.resolveShot(this.holderId, target.id);
  }

  private playerFires(targetId: string) {
    if (!this.canTarget(targetId)) return;
    if (this.isOnline) {
      this.busy = true;
      this.bridge!.requestFire(targetId);
    } else {
      this.resolveShot(this.localPlayerId, targetId);
    }
  }

  /** Standalone-only: decides the outcome itself, then animates it. */
  private resolveShot(shooterId: string, targetId: string) {
    const hit = this.pullTrigger();
    this.animateFire(shooterId, targetId, hit, () => {
      if (hit) {
        this.time.delayedCall(QUESTION_REVEAL_DELAY_MS, () => {
          const question = Phaser.Math.RND.pick(SAMPLE_QUESTIONS);
          this.showQuestion(targetId, question, true);
        });
      } else {
        this.time.delayedCall(MISS_PAUSE_MS, () => {
          this.busy = false;
          this.setHolder(targetId);
        });
      }
    });
  }

  /** Online-only: the server already decided; just play it out. */
  private applyFireResult(event: FireAnimationEvent) {
    this.animateFire(event.shooterId, event.targetId, event.hit, () => {
      // Holder/question state arrives separately via applyBridgeState — this
      // only needs to release the "animation in flight" guard.
      this.busy = false;
    });
  }

  /** Online-only: the server is the single source of truth for holder/status/question. */
  private applyBridgeState(state: RouletteBridgeState) {
    this.bridgeStatus = state.status;
    this.setHolder(state.holderId);
    if (state.status === 'QUESTION_ACTIVE' && state.questionText && state.lastTargetId) {
      this.showQuestion(state.lastTargetId, state.questionText, state.lastTargetId === this.localPlayerId);
    } else if (this.questionPanel.visible) {
      this.hideQuestionPanel();
    }
  }

  /**
   * Shared by both modes. Aims the gun at the target (see aimGun) without
   * ever repositioning it — it stays parked at the holder's hand. An empty
   * chamber never actually fires — the gun still aims, but no muzzle
   * animation and no bullet ever leaves it, just a beat of silence before
   * the click.
   */
  private animateFire(shooterId: string, targetId: string, hit: boolean, onResolved: () => void) {
    this.busy = true;
    const shooter = this.seatVisuals.get(shooterId)!;
    const target = this.seatVisuals.get(targetId)!;
    const aimAngle = Phaser.Math.Angle.Between(this.gun.x, this.gun.y, target.x, target.y - 40);
    this.aimGun(aimAngle);
    this.setTurnBannerText(`${shooter.seat.name} → ${target.seat.name}`);

    if (!hit) {
      this.time.delayedCall(REVEAL_TRAVEL_MS, () => {
        this.playMissPuff(targetId);
        onResolved();
      });
      return;
    }

    // The muzzle fires the instant the shot goes off — not when the bullet
    // lands. The bullet's travel is a separate, simultaneous animation.
    this.playGunFireSequence();

    const bullet = this.add
      .image(this.gun.x + Math.cos(aimAngle) * GUN_BARREL_LENGTH, this.gun.y + Math.sin(aimAngle) * GUN_BARREL_LENGTH, 'bullet')
      .setDepth(16)
      .setScale(0.05)
      .setRotation(aimAngle);

    this.tweens.add({
      targets: bullet,
      x: target.x,
      y: target.y - 40,
      duration: REVEAL_TRAVEL_MS,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        bullet.destroy();
        this.playImpactFlash(targetId);
        onResolved();
      },
    });
  }

  /** Fire, then smoke, then back to idle — the gun's own three-frame animation, played the instant the shot goes off. */
  private playGunFireSequence() {
    this.setGunFrame('gun-fire');
    this.sound.play('gun-shoot', { volume: GUNSHOT_VOLUME });
    this.time.delayedCall(FIRE_FLASH_MS, () => {
      this.setGunFrame('gun-smoke');
      this.time.delayedCall(GUN_SMOKE_MS, () => this.setGunFrame('gun-idle'));
    });
  }

  /** The red pulse on the target when the bullet actually lands — the gun's own muzzle animation already played back when the shot was fired. */
  private playImpactFlash(targetId: string) {
    const target = this.seatVisuals.get(targetId)!;
    const flash = this.add.circle(target.x, target.y - target.displayHeight / 2, target.displayHeight * 0.6, 0xff3b30, 0.55).setDepth(14);
    this.tweens.add({ targets: flash, alpha: 0, scale: 1.6, duration: 500, onComplete: () => flash.destroy() });
  }

  private playMissPuff(targetId: string) {
    this.sound.play('gun-miss', { volume: MISS_CLICK_VOLUME });
    const target = this.seatVisuals.get(targetId)!;
    const puff = this.add.text(target.x, target.y - target.displayHeight - 10, 'klik...', { fontFamily: 'monospace', fontSize: '16px', color: '#cbb9a8' }).setOrigin(0.5).setDepth(16);
    this.tweens.add({ targets: puff, y: puff.y - 30, alpha: 0, duration: MISS_PAUSE_MS, onComplete: () => puff.destroy() });
  }

  private showQuestion(targetId: string, questionText: string, canComplete: boolean) {
    const targetName = this.seatVisuals.get(targetId)?.seat.name ?? '';
    this.questionText.setText(`${targetName}, dolu çıktı! Retro sorusu:\n\n"${questionText}"`);
    this.questionPanel.setVisible(true).setAlpha(0).setScale(0.85);
    this.tweens.add({ targets: this.questionPanel, alpha: 1, scale: 1, duration: 220, ease: 'Back.Out' });
    this.pendingTargetId = targetId;

    this.completeButton.setText(canComplete ? 'CEVAPLADIM, DEVAM ET' : `${targetName} cevaplıyor...`);
    this.completeButton.setAlpha(canComplete ? 1 : 0.55);
    if (canComplete) this.completeButton.setInteractive({ useHandCursor: true });
    else this.completeButton.disableInteractive();
  }

  private hideQuestionPanel() {
    this.tweens.add({ targets: this.questionPanel, alpha: 0, scale: 0.9, duration: 160, onComplete: () => this.questionPanel.setVisible(false) });
  }

  private dismissQuestion() {
    this.tweens.add({
      targets: this.questionPanel,
      alpha: 0,
      scale: 0.9,
      duration: 160,
      onComplete: () => {
        this.questionPanel.setVisible(false);
        if (this.isOnline) {
          this.bridge!.completeQuestion();
        } else {
          this.resetCylinder();
          this.busy = false;
          this.setHolder(this.pendingTargetId);
        }
      },
    });
  }
}
