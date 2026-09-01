import { useEffect, useRef } from 'react';
import type { HideAndSeekPhase, HideAndSeekRole, HideAndSeekVisiblePlayer } from '@retro-platform/contracts';
import { HideSeekConfig } from '../domain/config';
import {
  isWallTile,
  mapWorldHeight,
  mapWorldWidth,
  worldToTile,
  type HideSeekTileGrid,
} from '../domain/map';
import { axisFromInput, stepMovement, type MovementInput } from '../domain/movement';
import { computeVisibleTiles, isTileKeyVisible } from '../domain/vision';
import type { HideSeekRoomBridge } from '../app/roomBridge';

const FLOOR_COLOR = '#241a35';
/** Deterministic per-tile texture overlay — a hash of the tile's own coordinates, never `Math.random()`, so the floor isn't flat but every player still sees the exact same pattern. */
const FLOOR_NOISE_BASE_ALPHA = 0.012;
const FLOOR_NOISE_ALPHA_RANGE = 0.022;
const WALL_TOP_COLOR = '#2a2140';
const WALL_SIDE_COLOR = '#120d1e';
/** Thin bright line along a wall's top edge where it opens onto a non-wall tile — the one detail that reads as "lit from above" instead of a flat pixel-art square. */
const WALL_TOP_EDGE_COLOR = '#453466';
/** How far a wall's visible side face extends into the floor tile below it, as a fraction of one tile. */
const WALL_DEPTH_RATIO = 0.26;
/**
 * Token color is relative to *who's looking*, not the target's role alone —
 * see `tokenColorFor()`. A hider sees themselves green, other hiders blue,
 * and the seeker red; the seeker sees red across the board (no teammates to
 * pick out, so no reason to split "me" from "them").
 */
const SELF_FILL = '#4cd08a';
const ALLY_FILL = '#4aa3ff';
const SEEKER_FILL = '#e6553f';
const REMOTE_PLAYER_OUTLINE = '#f5f4f8';
const BACKDROP_COLOR = '#050409';
/** Warm lantern-glow tint laid over the currently-visible area, additive (`screen` blend) so it only brightens, never recolors, what's underneath. */
const LANTERN_GLOW_RGB = '255, 201, 120';
/** Fog opacity for a tile that's outside vision entirely (behind a wall, or out of range) and has never been seen before. Fully opaque — never a partial hint. */
const FOG_OPAQUE_ALPHA = 1;
/** Fog opacity for a tile that's been seen before but isn't visible right now — dimmer than `FOG_OPAQUE_ALPHA`, so a room already found doesn't vanish the instant you leave it. */
const FOG_EXPLORED_ALPHA = 0.7;
/** Widest opacity used for the soft falloff ring at the very edge of vision, on tiles that ARE visible. */
const FOG_EDGE_MAX_ALPHA = 0.6;
/** How many tiles wide the soft edge ring is, measured inward from VISION_RADIUS. */
const FOG_EDGE_WIDTH_TILES = 1;
/** How strongly the fog mask is blurred, in world pixels — turns the tile grid's hard square edges into a soft torchlight falloff. Defined in world units, same as the rest of this file, so it scales with `renderScale` automatically instead of needing its own screen-size-aware logic. */
const FOG_BLUR_WORLD_PX = 10;
/** Snapshots arrive roughly this often — remote players are interpolated across exactly this window so motion stays smooth between ticks. */
const SNAPSHOT_INTERVAL_MS = 1000 / HideSeekConfig.TICK_RATE;
/** How far the client's own prediction may drift from the server's authoritative reply before snapping instead of easing. */
const RECONCILE_SNAP_THRESHOLD_PX = HideSeekConfig.TILE_SIZE * 2;
/** Fraction of the remaining gap closed on every authoritative update, when the gap is small enough to ease rather than snap. */
const RECONCILE_EASE_FACTOR = 0.3;
/** How long the fog fades in/out across a REVEAL boundary — an abrupt cut read as a glitch, not a lighting change. */
const FOG_FADE_SECONDS = 0.4;
const CATCH_RING_COLOR = '#e6553f';
/** Free-fly speed once caught and turned into a spectator — no collision, so this can be brisk. */
const SPECTATOR_CAMERA_SPEED = HideSeekConfig.PLAYER_SPEED * 2;
/** Widest opacity of the screen-edge red vignette, reached as the local player's own catch progress nears 1. */
const VIGNETTE_MAX_ALPHA = 0.55;
/**
 * Purely a drawing radius — deliberately bigger than the actual collision
 * hitbox (`HideSeekConfig.PLAYER_RADIUS`, used for wall collision and never
 * touched here). Players read as a dot at the true hitbox size once the map
 * is scaled to fit the screen (see `renderScale` in `draw()`); this only
 * makes the token easier to see, never changes what a player can walk
 * through or how close a catch needs to be.
 */
const VISUAL_PLAYER_RADIUS = HideSeekConfig.PLAYER_RADIUS * 1.5;
/** How often `onLocalStep` fires while the local player is actually moving. */
const FOOTSTEP_INTERVAL_SECONDS = 0.33;
/** How long a screen shake / catch burst lingers, in milliseconds. */
const CATCH_IMPACT_DURATION_MS = 500;
/** Widest world-pixel offset the shake applies, right at the moment of impact — decays to 0 over `CATCH_IMPACT_DURATION_MS`. */
const SHAKE_MAX_OFFSET_PX = 6;
/** How long a single footprint mark stays visible before fading out entirely, in milliseconds. */
const FOOTPRINT_LIFETIME_MS = 3000;
/** Opacity a footprint is drawn at the instant it's placed — it only ever fades down from here. */
const FOOTPRINT_MAX_ALPHA = 0.35;
/** World-pixel size of one footprint oval: long axis along the direction of travel. */
const FOOTPRINT_LENGTH = 5;
const FOOTPRINT_WIDTH = 2.6;
/** How far a footprint sits to either side of the player's direct path, world px — the left/right alternation that makes it read as a gait rather than a dotted line straight down the middle. */
const FOOTPRINT_SIDE_OFFSET_PX = 3;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** A cheap deterministic 0..1 hash of a tile coordinate — used for the floor's texture overlay, never `Math.random()`, so two clients looking at the same tile draw the exact same speck. */
function tileNoise(x: number, y: number): number {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

/** Center-crops `image` to a square and draws it filling a `diameter`-wide square centered at (centerX, centerY) — "object-fit: cover" for canvas. The caller is expected to have already clipped to a circle; a portrait's own aspect ratio doesn't matter once that clip is in place. */
function drawAvatarImageCover(imageCtx: CanvasRenderingContext2D, image: HTMLImageElement, centerX: number, centerY: number, diameter: number): void {
  const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
  const sourceX = (image.naturalWidth - sourceSize) / 2;
  const sourceY = (image.naturalHeight - sourceSize) / 2;
  imageCtx.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, centerX - diameter / 2, centerY - diameter / 2, diameter, diameter);
}

/** Moves `current` toward `target` by at most `maxDelta`, without overshooting — a frame-rate-independent ease. */
function moveToward(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}

const KEY_TO_AXIS: Record<string, keyof MovementInput> = {
  w: 'up', ArrowUp: 'up',
  s: 'down', ArrowDown: 'down',
  a: 'left', ArrowLeft: 'left',
  d: 'right', ArrowRight: 'right',
};

interface RemotePlayerTrack {
  role: HideAndSeekRole;
  prevX: number;
  prevY: number;
  targetX: number;
  targetY: number;
  receivedAtMs: number;
  catchProgress: number;
  /** Radians, from the last tick that actually moved this player — held steady while they're stationary rather than snapping to some default, so an idle player doesn't visibly spin in place. */
  facingAngle: number;
  /** `performance.now()` of this player's last footprint mark — throttles the trail the same way `footstepAccumulatorSeconds` throttles the local player's own. */
  lastFootprintAtMs: number;
  /** Alternates every mark so the trail reads as a left-right gait instead of one straight dotted line. */
  footprintSide: 1 | -1;
}

/** One footprint left behind on the floor — see `drawFootprints()`. Color is baked in at creation time rather than re-derived from role/isSelf at render time: a role never changes mid-round, so there's nothing to go stale. */
interface FootprintMark {
  x: number;
  y: number;
  angle: number;
  side: 1 | -1;
  createdAtMs: number;
  color: string;
}

/** Resolved room-roster info for one player: their display name and, if they picked one, an absolute avatar image URL. This file never talks to the room/platform itself — `HideSeekOnlineOptions.identityFor` supplies it, already resolved. */
export interface HideSeekPlayerIdentity {
  displayName: string;
  avatarUrl?: string;
}

export interface HideSeekOnlineOptions {
  bridge: HideSeekRoomBridge;
  localPlayerId: string;
  localRole: HideAndSeekRole;
  /**
   * Looks up a player's room identity by id. Optional, and may return
   * `undefined` even when supplied — before the first `roomSnapshot`
   * arrives, or for a player who never picked an avatar. Either way the
   * token still draws (a flat role-colored fallback), just without a
   * portrait or name tag.
   */
  identityFor?: (playerId: string) => HideSeekPlayerIdentity | undefined;
  /** Called on roughly every real step of local movement (throttled internally — see `FOOTSTEP_INTERVAL_SECONDS`), never for the spectator free-camera or a step that walked straight into a wall. Fire-and-forget; this file has no opinion on what it does. */
  onLocalStep?: () => void;
}

export interface HideSeekCanvasProps {
  grid: HideSeekTileGrid;
  /** Undefined in standalone mode — a single local wanderer with no server, no roles, no other players. */
  online?: HideSeekOnlineOptions;
  /**
   * The room's current phase — unlike `grid`/`online`, this changes over the
   * canvas's lifetime, so it's fed into the render loop through a ref rather
   * than being part of the fixed-at-mount setup below. Undefined in
   * standalone mode, where there is no phase system at all.
   */
  phase?: HideAndSeekPhase;
}

/**
 * Client-local movement/rendering, in both modes:
 * - Standalone: this canvas *is* the authority (no server exists to disagree with).
 * - Online: this canvas predicts its own player's movement every frame using
 *   the exact same `stepMovement` the server runs, sends held input at
 *   `TICK_RATE`, and eases (or snaps, if the gap is large) toward whatever
 *   authoritative position each `hideAndSeekSnapshot` reports. Other players
 *   are never predicted — only interpolated between the last two snapshots
 *   that mentioned them, so they don't visibly teleport at 20Hz.
 */
export function HideSeekCanvas({ grid, online, phase }: HideSeekCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const phaseRef = useRef(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // `grid` is fixed for the lifetime of this mount (see the effect's own
    // closing comment), so its world size and the fog-mask canvases sized
    // from it only need to happen once, not every `draw()` call.
    const worldWidth = mapWorldWidth(grid);
    const worldHeight = mapWorldHeight(grid);

    // Fog is composited in two passes: a hard-edged mask at world-pixel
    // resolution, then a blurred copy of it — rather than blurring (or
    // filtering) anything drawn directly into the main, already-scaled
    // canvas, where the blur radius would have to account for `renderScale`
    // itself. Blurring a fixed-size offscreen bitmap and letting `drawImage`
    // scale the *result* keeps `FOG_BLUR_WORLD_PX` meaning the same thing
    // regardless of window size.
    const fogMaskCanvas = document.createElement('canvas');
    fogMaskCanvas.width = worldWidth;
    fogMaskCanvas.height = worldHeight;
    const fogMaskCtx = fogMaskCanvas.getContext('2d');
    const fogBlurredCanvas = document.createElement('canvas');
    fogBlurredCanvas.width = worldWidth;
    fogBlurredCanvas.height = worldHeight;
    const fogBlurredCtx = fogBlurredCanvas.getContext('2d');

    // Every tile key this player has ever actually seen (via the shadowcast
    // vision check below) — never cleared, so a room found once stays dimly
    // remembered instead of vanishing back into full fog the moment the
    // player walks away. Deliberately *not* populated by REVEAL (where fog
    // is suppressed entirely, see `fogSuppression`): REVEAL is a shared,
    // temporary flood of light, not something that should make every future
    // DARK phase permanently easier.
    const exploredTiles = new Set<string>();

    // One <img> per avatar URL, reused across frames and shared by every
    // player who happens to have the same portrait. No onload wiring —
    // `draw()` already runs every animation frame, so the very next one
    // after a decode finishes just picks the loaded image up on its own.
    const avatarImageCache = new Map<string, HTMLImageElement>();
    function getLoadedAvatarImage(url: string): HTMLImageElement | undefined {
      let image = avatarImageCache.get(url);
      if (!image) {
        image = new Image();
        image.src = url;
        avatarImageCache.set(url, image);
      }
      // `.complete` alone doesn't mean "loaded successfully" — a failed
      // fetch also leaves it `true`. `naturalWidth > 0` is what tells the
      // two apart.
      return image.complete && image.naturalWidth > 0 ? image : undefined;
    }

    const spawnTile = { x: 1, y: 1 };
    let worldX = (spawnTile.x + 0.5) * grid.tileSize;
    let worldY = (spawnTile.y + 0.5) * grid.tileSize;
    // The very first real position — standalone spawns arbitrarily near the
    // top-left; online mode has no idea where it is until its first
    // `hideAndSeekSnapshot` arrives, so nothing is drawn until then.
    let hasKnownPosition = !online;

    const pressedKeys = new Set<string>();
    const remotePlayers = new Map<string, RemotePlayerTrack>();
    let localRole: HideAndSeekRole = online?.localRole ?? 'HIDER';
    let inputSeq = 0;
    let sendAccumulatorSeconds = 0;
    const sendIntervalSeconds = 1 / HideSeekConfig.TICK_RATE;
    // One-way latch: once caught, always a spectator for the rest of this
    // mount. From that point, `worldX`/`worldY` stop being an authoritative
    // (now-frozen) player position and become a free-roaming camera instead —
    // no server reconciliation, no collision, no more input sent.
    let isSpectator = false;
    let ownCatchProgress = 0;
    // Radians — same "hold the last real direction" idea as `RemotePlayerTrack.facingAngle`, updated in `step()`.
    let localFacingAngle = Math.PI / 2;
    // Time-based rather than distance-based — simpler, and "every N
    // seconds while actually moving" already reads as footsteps without
    // needing to track total distance traveled.
    let footstepAccumulatorSeconds = 0;
    /** Alternates every footstep — see `RemotePlayerTrack.footprintSide`'s doc for why. */
    let localFootprintSide: 1 | -1 = 1;

    // The canvas's CSS size always tracks the window (100vw/100vh), but its
    // backing buffer is sized in *physical* pixels — devicePixelRatio times
    // that — so drawing stays crisp on HiDPI/scaled displays instead of the
    // browser stretching a 1:1 buffer and blurring everything. Capped at 2:
    // beyond that the extra sharpness isn't worth the larger buffer to fill
    // every frame. `draw()` reads this back to convert its buffer-space
    // fills into the CSS-pixel space the rest of its math already uses.
    let dpr = 1;

    function resizeCanvas() {
      if (!canvas) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    function onKeyDown(event: KeyboardEvent) {
      if (event.key in KEY_TO_AXIS) pressedKeys.add(event.key);
    }
    function onKeyUp(event: KeyboardEvent) {
      pressedKeys.delete(event.key);
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    function currentInput(): MovementInput {
      const input: MovementInput = { up: false, down: false, left: false, right: false };
      for (const key of pressedKeys) {
        const axis = KEY_TO_AXIS[key];
        if (axis) input[axis] = true;
      }
      return input;
    }

    // Screen-shake state: a single impact "expires" at `shakeUntilMs`, its
    // strength decaying linearly from `SHAKE_MAX_OFFSET_PX` down to 0 over
    // that window — see `currentShakeOffset()`. Catch bursts are a small,
    // continuously-filtered list rather than a full particle system: each
    // is just a position and a start time, drawn as an expanding ring by
    // `drawCatchBursts()` and dropped once `CATCH_IMPACT_DURATION_MS` has passed.
    let shakeUntilMs = 0;
    let catchBursts: { x: number; y: number; startedAtMs: number }[] = [];

    // A shared trail across every player — local and remote both push into
    // it (see `step()` and `applyRemoteUpdate`), colored the same as that
    // player's own token ring. A seeker's trail reading red is just this
    // falling out of reusing `tokenColorFor`, not a second system.
    let footprintMarks: FootprintMark[] = [];

    // A catch is dramatic for everyone nearby, not just the two players
    // involved — this fires for every catch in the room, whether the
    // caught player is the local one, currently visible, or neither (in
    // which case there's simply no position to burst at, only the shake).
    const disposePlayerCaught = online?.bridge.onPlayerCaught((event) => {
      shakeUntilMs = performance.now() + CATCH_IMPACT_DURATION_MS;
      let atX: number | undefined;
      let atY: number | undefined;
      if (event.playerId === online.localPlayerId) {
        atX = worldX;
        atY = worldY;
      } else {
        const track = remotePlayers.get(event.playerId);
        if (track) {
          atX = track.targetX;
          atY = track.targetY;
        }
      }
      if (atX !== undefined && atY !== undefined) {
        catchBursts.push({ x: atX, y: atY, startedAtMs: performance.now() });
      }
    });

    const disposeSnapshot = online?.bridge.onSnapshot((snapshot) => {
      const now = performance.now();
      if (snapshot.isSpectator) isSpectator = true; // latches — never un-caught
      ownCatchProgress = snapshot.catchProgress;

      if (!hasKnownPosition) {
        // First authoritative word on where we actually are — jump straight there, nothing to ease from yet.
        worldX = snapshot.x;
        worldY = snapshot.y;
        hasKnownPosition = true;
      } else if (!isSpectator) {
        // Once a spectator, worldX/Y are the free camera's own coordinates —
        // the server's (now-frozen) authoritative position is irrelevant.
        const distance = Math.hypot(snapshot.x - worldX, snapshot.y - worldY);
        if (distance > RECONCILE_SNAP_THRESHOLD_PX) {
          worldX = snapshot.x;
          worldY = snapshot.y;
        } else {
          worldX = lerp(worldX, snapshot.x, RECONCILE_EASE_FACTOR);
          worldY = lerp(worldY, snapshot.y, RECONCILE_EASE_FACTOR);
        }
      }

      const seenIds = new Set<string>();
      for (const visible of snapshot.visiblePlayers) {
        seenIds.add(visible.playerId);
        applyRemoteUpdate(visible, now);
      }
      for (const trackedId of remotePlayers.keys()) {
        if (!seenIds.has(trackedId)) remotePlayers.delete(trackedId);
      }
    });

    function applyRemoteUpdate(visible: HideAndSeekVisiblePlayer, now: number) {
      const existing = remotePlayers.get(visible.playerId);
      if (existing) {
        // Same "hold the last real direction" reasoning as the local
        // player's own facing angle below — a tick with zero movement
        // shouldn't snap the notch back to some arbitrary default.
        const dx = visible.x - existing.targetX;
        const dy = visible.y - existing.targetY;
        if (dx !== 0 || dy !== 0) {
          existing.facingAngle = Math.atan2(dy, dx);
          if (now - existing.lastFootprintAtMs >= FOOTSTEP_INTERVAL_SECONDS * 1000) {
            existing.lastFootprintAtMs = now;
            existing.footprintSide = existing.footprintSide === 1 ? -1 : 1;
            footprintMarks.push({
              x: existing.targetX,
              y: existing.targetY,
              angle: existing.facingAngle,
              side: existing.footprintSide,
              createdAtMs: now,
              color: tokenColorFor(existing.role, false),
            });
          }
        }
        existing.prevX = lerp(existing.prevX, existing.targetX, computeInterpolationAlpha(existing.receivedAtMs, now));
        existing.prevY = lerp(existing.prevY, existing.targetY, computeInterpolationAlpha(existing.receivedAtMs, now));
        existing.targetX = visible.x;
        existing.targetY = visible.y;
        existing.receivedAtMs = now;
        existing.role = visible.role;
        existing.catchProgress = visible.catchProgress;
      } else {
        remotePlayers.set(visible.playerId, {
          role: visible.role,
          prevX: visible.x,
          prevY: visible.y,
          targetX: visible.x,
          targetY: visible.y,
          receivedAtMs: now,
          catchProgress: visible.catchProgress,
          facingAngle: Math.PI / 2,
          lastFootprintAtMs: now,
          footprintSide: 1,
        });
      }
    }

    function computeInterpolationAlpha(receivedAtMs: number, now: number): number {
      return clamp01((now - receivedAtMs) / SNAPSHOT_INTERVAL_MS);
    }

    function localSpeed(): number {
      return localRole === 'SEEKER'
        ? HideSeekConfig.PLAYER_SPEED * HideSeekConfig.SEEKER_SPEED_MULT
        : HideSeekConfig.PLAYER_SPEED;
    }

    // 0 = normal fog, 1 = fully suppressed (REVEAL) — eased toward whichever
    // the current phase calls for, at a fixed rate, so a REVEAL boundary
    // fades over ~FOG_FADE_SECONDS instead of cutting instantly.
    let fogSuppression = phaseRef.current === 'REVEAL' ? 1 : 0;

    function step(dtSeconds: number) {
      if (!hasKnownPosition) return; // waiting for our first server snapshot

      fogSuppression = moveToward(fogSuppression, isSpectator || phaseRef.current === 'REVEAL' ? 1 : 0, dtSeconds / FOG_FADE_SECONDS);

      const input = currentInput();
      const axis = axisFromInput(input);
      if (axis.x !== 0 || axis.y !== 0) localFacingAngle = Math.atan2(axis.y, axis.x);

      if (isSpectator) {
        // Free camera: no collision, no server round-trip — a spectator
        // can't affect live players, so there's nothing to send.
        const length = Math.hypot(axis.x, axis.y);
        if (length > 0) {
          const distance = SPECTATOR_CAMERA_SPEED * dtSeconds;
          worldX += (axis.x / length) * distance;
          worldY += (axis.y / length) * distance;
        }
        return;
      }

      // The seeker is server-frozen during PREP (see HideSeekGame.Move) — the
      // client mirrors that locally so prediction doesn't rubber-band the
      // instant the first authoritative snapshot corrects it back to spawn.
      const seekerFrozenInPrep = phaseRef.current === 'PREP' && localRole === 'SEEKER';
      if (!seekerFrozenInPrep) {
        const next = stepMovement(grid, { x: worldX, y: worldY }, input, localSpeed(), dtSeconds);
        // Distinguishes "held a direction and actually moved" from "held a
        // direction but walked straight into a wall" — only the former
        // should keep footsteps ticking; the latter should go silent
        // immediately rather than keep clicking in place against a wall.
        const actuallyMoved = next.x !== worldX || next.y !== worldY;
        worldX = next.x;
        worldY = next.y;
        if (actuallyMoved) {
          footstepAccumulatorSeconds += dtSeconds;
          if (footstepAccumulatorSeconds >= FOOTSTEP_INTERVAL_SECONDS) {
            footstepAccumulatorSeconds = 0;
            online?.onLocalStep?.();
            localFootprintSide = localFootprintSide === 1 ? -1 : 1;
            footprintMarks.push({
              x: worldX,
              y: worldY,
              angle: localFacingAngle,
              side: localFootprintSide,
              createdAtMs: performance.now(),
              color: tokenColorFor(localRole, true),
            });
          }
        } else {
          footstepAccumulatorSeconds = 0;
        }
      }

      if (online) {
        sendAccumulatorSeconds += dtSeconds;
        if (sendAccumulatorSeconds >= sendIntervalSeconds) {
          sendAccumulatorSeconds = 0;
          inputSeq += 1;
          online.bridge.sendInput({ ...input, seq: inputSeq });
        }
      }
    }

    function draw() {
      if (!canvas || !ctx) return;
      // Everything below draws in CSS-pixel space — `dpr` alone accounts
      // for the buffer being that many times larger, so world-unit math
      // (tile sizes, player positions) never has to know about it.
      const cssWidth = canvas.width / dpr;
      const cssHeight = canvas.height / dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = BACKDROP_COLOR;
      ctx.fillRect(0, 0, cssWidth, cssHeight);
      if (!hasKnownPosition) return;

      // The whole map always fits on screen — no panning. Scaled to the
      // smaller of the two axis ratios ("contain") and centered, so a map
      // whose aspect ratio doesn't match the window's letterboxes on one
      // axis rather than either overflowing or leaving both axes with
      // empty space. This is also what makes players read as more than a
      // handful of pixels: the same 20px tile that used to draw 1:1 now
      // draws at `renderScale` times that.
      const renderScale = Math.min(cssWidth / worldWidth, cssHeight / worldHeight);
      const offsetX = (cssWidth - worldWidth * renderScale) / 2;
      const offsetY = (cssHeight - worldHeight * renderScale) / 2;
      const shake = currentShakeOffset();

      ctx.save();
      ctx.translate(offsetX + shake.x, offsetY + shake.y);
      ctx.scale(renderScale, renderScale);

      // The full grid is always on screen now (no camera to clip against),
      // and these maps are small enough that walking every tile each frame
      // is cheap — so these are just the grid's own bounds, not a viewport
      // window into it. Named to match the loops below, which don't care
      // whether the range came from a viewport or the whole grid.
      const tileSize = grid.tileSize;
      const firstTileX = 0;
      const firstTileY = 0;
      const lastTileX = grid.width - 1;
      const lastTileY = grid.height - 1;

      // z0 — floor, base color plus a deterministic texture speck per tile
      // (never a stroke outline here — that's what used to make the floor
      // read as a grid of pixel-art squares instead of one smooth room).
      for (let tileY = firstTileY; tileY <= lastTileY; tileY++) {
        for (let tileX = firstTileX; tileX <= lastTileX; tileX++) {
          if (grid.tiles[tileY][tileX] === 1) continue;
          ctx.fillStyle = FLOOR_COLOR;
          ctx.fillRect(tileX * tileSize, tileY * tileSize, tileSize, tileSize);
          const speckAlpha = FLOOR_NOISE_BASE_ALPHA + tileNoise(tileX, tileY) * FLOOR_NOISE_ALPHA_RANGE;
          ctx.fillStyle = `rgba(255, 255, 255, ${speckAlpha.toFixed(3)})`;
          ctx.fillRect(
            tileX * tileSize + tileNoise(tileX, tileY) * tileSize * 0.5,
            tileY * tileSize + tileNoise(tileY, tileX) * tileSize * 0.5,
            tileSize * 0.34,
            tileSize * 0.34,
          );
        }
      }

      // z1a — wall side faces, all of them before any top face (z1b below)
      // — otherwise a wall's top face would paint over its neighbor's side
      // face, or vice versa, depending on iteration order. Only drawn where
      // the tile immediately below is floor: a wall with another wall below
      // it has no exposed face there to shade.
      const wallDepth = tileSize * WALL_DEPTH_RATIO;
      for (let tileY = firstTileY; tileY <= lastTileY; tileY++) {
        for (let tileX = firstTileX; tileX <= lastTileX; tileX++) {
          if (grid.tiles[tileY][tileX] !== 1) continue;
          if (isWallTile(grid, tileX, tileY + 1)) continue;
          ctx.fillStyle = WALL_SIDE_COLOR;
          ctx.fillRect(tileX * tileSize, (tileY + 1) * tileSize, tileSize, wallDepth);
        }
      }

      // z1b — wall top faces, brighter than the side faces so the tile
      // reads as a raised block rather than a flat one; a thin highlight
      // line along any edge that opens onto a non-wall tile stands in for
      // light catching the top of the block.
      for (let tileY = firstTileY; tileY <= lastTileY; tileY++) {
        for (let tileX = firstTileX; tileX <= lastTileX; tileX++) {
          if (grid.tiles[tileY][tileX] !== 1) continue;
          ctx.fillStyle = WALL_TOP_COLOR;
          ctx.fillRect(tileX * tileSize, tileY * tileSize, tileSize, tileSize);
          if (!isWallTile(grid, tileX, tileY - 1)) {
            ctx.fillStyle = WALL_TOP_EDGE_COLOR;
            ctx.fillRect(tileX * tileSize, tileY * tileSize, tileSize, Math.max(1.5, tileSize * 0.09));
          }
        }
      }

      drawFootprints();

      // Other players — interpolated between the last two snapshots that
      // mentioned them, drawn before the fog so the fog can still hide them.
      const now = performance.now();
      for (const [playerId, track] of remotePlayers.entries()) {
        const alpha = computeInterpolationAlpha(track.receivedAtMs, now);
        const drawX = lerp(track.prevX, track.targetX, alpha);
        const drawY = lerp(track.prevY, track.targetY, alpha);
        drawPlayerToken(drawX, drawY, track.role, false, track.catchProgress, track.facingAngle, online?.identityFor?.(playerId), true);
      }

      // Fog of war: authoritative per-tile visibility from shadowcasting —
      // never a plain radial gradient, or it would leak through walls. Fully
      // (or partially, mid-fade) suppressed during REVEAL, when the server
      // has already stopped filtering who's in `visiblePlayers` too.
      //
      // Composited in three steps: fill a hard-edged mask (world-pixel
      // resolution, off the visible canvas) → blur that mask on a second
      // offscreen canvas → stamp the blurred result onto the map. Blurring
      // the *mask* rather than the map keeps the map's own pixels crisp —
      // only the darkness gets the soft torchlight edge — and blurring a
      // fixed-size bitmap once, instead of filtering every fog fillRect
      // individually, is the cheap way to get that softness at 60fps.
      if (fogSuppression < 1 && fogMaskCtx && fogBlurredCtx) {
        const playerTile = worldToTile(grid, worldX, worldY);
        const visibleTiles = computeVisibleTiles(grid, playerTile.x, playerTile.y, HideSeekConfig.VISION_RADIUS);
        for (const key of visibleTiles) exploredTiles.add(key);
        const fadeStart = HideSeekConfig.VISION_RADIUS - FOG_EDGE_WIDTH_TILES;

        fogMaskCtx.clearRect(0, 0, worldWidth, worldHeight);
        for (let tileY = 0; tileY < grid.height; tileY++) {
          for (let tileX = 0; tileX < grid.width; tileX++) {
            let fogAlpha: number;
            if (isTileKeyVisible(visibleTiles, tileX, tileY)) {
              const distance = Math.hypot(tileX - playerTile.x, tileY - playerTile.y);
              fogAlpha = distance <= fadeStart
                ? 0
                : clamp01((distance - fadeStart) / FOG_EDGE_WIDTH_TILES) * FOG_EDGE_MAX_ALPHA;
            } else {
              fogAlpha = exploredTiles.has(`${tileX},${tileY}`) ? FOG_EXPLORED_ALPHA : FOG_OPAQUE_ALPHA;
            }
            fogAlpha *= 1 - fogSuppression;
            if (fogAlpha <= 0) continue;
            fogMaskCtx.fillStyle = `rgba(4, 3, 9, ${fogAlpha})`;
            // +1px so adjacent tiles' fills overlap instead of leaving a
            // hairline seam once this mask gets blurred and rescaled.
            fogMaskCtx.fillRect(tileX * tileSize, tileY * tileSize, tileSize + 1, tileSize + 1);
          }
        }

        fogBlurredCtx.clearRect(0, 0, worldWidth, worldHeight);
        fogBlurredCtx.filter = `blur(${FOG_BLUR_WORLD_PX}px)`;
        fogBlurredCtx.drawImage(fogMaskCanvas, 0, 0);
        fogBlurredCtx.filter = 'none';
        ctx.drawImage(fogBlurredCanvas, 0, 0);

        // Lantern warmth over the lit area — `screen` blend only ever
        // brightens what's underneath, so it can't wash out the fog mask's
        // own darkening or recolor the floor/wall art.
        const lanternX = (playerTile.x + 0.5) * tileSize;
        const lanternY = (playerTile.y + 0.5) * tileSize;
        const lanternRadius = (HideSeekConfig.VISION_RADIUS + 0.6) * tileSize;
        const lanternGlow = ctx.createRadialGradient(
          lanternX, lanternY, tileSize * 0.3,
          lanternX, lanternY, lanternRadius,
        );
        lanternGlow.addColorStop(0, `rgba(${LANTERN_GLOW_RGB}, ${(0.16 * (1 - fogSuppression)).toFixed(3)})`);
        lanternGlow.addColorStop(1, `rgba(${LANTERN_GLOW_RGB}, 0)`);
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = lanternGlow;
        ctx.fillRect(0, 0, worldWidth, worldHeight);
        ctx.restore();
      }

      drawCatchBursts();

      // A spectator has no body on the map anymore — worldX/Y is a free
      // camera position now, not a player standing somewhere.
      if (!isSpectator) {
        // The local player is always fully lit to themselves, drawn last so
        // fog never dims it. No name tag for yourself — you already know
        // who you are; see `drawPlayerToken`'s `showName` param.
        const ownIdentity = online ? online.identityFor?.(online.localPlayerId) : undefined;
        drawPlayerToken(worldX, worldY, localRole, true, ownCatchProgress, localFacingAngle, ownIdentity, false);
      }

      ctx.restore();

      // Screen-space red vignette while being caught — the local player's
      // own feedback, on top of the ring everyone else sees around them.
      // Back in CSS-pixel space post-restore, same as the backdrop fill
      // above, so this uses cssWidth/cssHeight rather than the physical
      // (dpr-scaled) canvas.width/height.
      if (ownCatchProgress > 0) {
        const alpha = ownCatchProgress * VIGNETTE_MAX_ALPHA;
        const maxRadius = Math.hypot(cssWidth, cssHeight) / 2;
        const gradient = ctx.createRadialGradient(
          cssWidth / 2, cssHeight / 2, maxRadius * 0.55,
          cssWidth / 2, cssHeight / 2, maxRadius,
        );
        gradient.addColorStop(0, 'rgba(230, 85, 63, 0)');
        gradient.addColorStop(1, `rgba(230, 85, 63, ${alpha})`);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, cssWidth, cssHeight);
      }
    }

    /** Current screen-shake offset, in world pixels — 0 outside an active shake, decaying linearly to 0 as `shakeUntilMs` approaches. Applied to the world transform in `draw()`, so it nudges everything (walls, players, fog) together rather than the players alone. */
    function currentShakeOffset(): { x: number; y: number } {
      const remainingMs = shakeUntilMs - performance.now();
      if (remainingMs <= 0) return { x: 0, y: 0 };
      const magnitude = SHAKE_MAX_OFFSET_PX * (remainingMs / CATCH_IMPACT_DURATION_MS);
      return { x: (Math.random() * 2 - 1) * magnitude, y: (Math.random() * 2 - 1) * magnitude };
    }

    /** Expanding, fading rings at every recent catch — drawn even for a catch outside the local player's own vision radius (a burst is a "something just happened nearby" cue, not a fog-filtered detail), but only when a position was actually known (see `disposePlayerCaught` above). */
    function drawCatchBursts() {
      if (!ctx) return;
      const now = performance.now();
      catchBursts = catchBursts.filter((burst) => now - burst.startedAtMs < CATCH_IMPACT_DURATION_MS);
      for (const burst of catchBursts) {
        const progress = (now - burst.startedAtMs) / CATCH_IMPACT_DURATION_MS;
        const radius = VISUAL_PLAYER_RADIUS + progress * VISUAL_PLAYER_RADIUS * 2.5;
        const alpha = 1 - progress;
        ctx.strokeStyle = `rgba(230, 85, 63, ${alpha.toFixed(3)})`;
        ctx.lineWidth = 1 + 3 * (1 - progress);
        ctx.beginPath();
        ctx.arc(burst.x, burst.y, radius, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    /**
     * The floor trail: small ovals, long axis along the direction of
     * travel, alternating either side of the straight path (see
     * `FootprintMark.side`) so it reads as a walking gait instead of a
     * dotted line. Drawn on the floor — before any player token, and
     * before the fog composite so out-of-vision marks still get dimmed the
     * same way the floor under them does.
     */
    function drawFootprints() {
      if (!ctx) return;
      const now = performance.now();
      footprintMarks = footprintMarks.filter((mark) => now - mark.createdAtMs < FOOTPRINT_LIFETIME_MS);
      for (const mark of footprintMarks) {
        const progress = (now - mark.createdAtMs) / FOOTPRINT_LIFETIME_MS;
        const perpAngle = mark.angle + Math.PI / 2;
        const offsetX = Math.cos(perpAngle) * FOOTPRINT_SIDE_OFFSET_PX * mark.side;
        const offsetY = Math.sin(perpAngle) * FOOTPRINT_SIDE_OFFSET_PX * mark.side;
        ctx.save();
        ctx.translate(mark.x + offsetX, mark.y + offsetY);
        ctx.rotate(mark.angle);
        ctx.globalAlpha = FOOTPRINT_MAX_ALPHA * (1 - progress);
        ctx.fillStyle = mark.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, FOOTPRINT_LENGTH / 2, FOOTPRINT_WIDTH / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    /** A soft ellipse under a player's feet — without it the token reads as floating rather than standing on the floor. Drawn before the token's own fill, same as any other z1-below-z2 layering here. */
    function drawPlayerShadow(x: number, y: number) {
      if (!ctx) return;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath();
      ctx.ellipse(x, y + VISUAL_PLAYER_RADIUS * 0.78, VISUAL_PLAYER_RADIUS * 0.86, VISUAL_PLAYER_RADIUS * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    /**
     * Which color a token draws in. Red is reserved for "the seeker" as an
     * identity, not a target's role in isolation — the seeker's own token
     * reads red too, so they can still pick themselves out at a glance
     * instead of every token looking alike. Green is a hider's own token;
     * blue is everyone else who isn't the seeker, whether the one looking
     * is a hider (their fellow hiders) or the seeker themselves (everyone
     * they're hunting).
     */
    function tokenColorFor(targetRole: HideAndSeekRole, isSelf: boolean): string {
      if (targetRole === 'SEEKER') return SEEKER_FILL;
      return isSelf ? SELF_FILL : ALLY_FILL;
    }

    /**
     * One player's full token: shadow, portrait (a flat color while it's
     * still loading, or if none was picked), a color ring — the only
     * identity signal left once a portrait covers the fill, see
     * `tokenColorFor` — a small facing notch, and the catch-progress ring.
     * `showName` is false for the local player; see the call site.
     */
    function drawPlayerToken(
      x: number,
      y: number,
      role: HideAndSeekRole,
      isSelf: boolean,
      catchProgress: number,
      facingAngle: number,
      identity: HideSeekPlayerIdentity | undefined,
      showName: boolean,
    ) {
      if (!ctx) return;
      drawPlayerShadow(x, y);

      const roleColor = tokenColorFor(role, isSelf);
      const avatarImage = identity?.avatarUrl ? getLoadedAvatarImage(identity.avatarUrl) : undefined;

      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, VISUAL_PLAYER_RADIUS, 0, Math.PI * 2);
      ctx.clip();
      if (avatarImage) {
        drawAvatarImageCover(ctx, avatarImage, x, y, VISUAL_PLAYER_RADIUS * 2);
      } else {
        ctx.fillStyle = roleColor;
        ctx.fillRect(x - VISUAL_PLAYER_RADIUS, y - VISUAL_PLAYER_RADIUS, VISUAL_PLAYER_RADIUS * 2, VISUAL_PLAYER_RADIUS * 2);
      }
      ctx.restore();

      ctx.strokeStyle = roleColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, VISUAL_PLAYER_RADIUS, 0, Math.PI * 2);
      ctx.stroke();

      const notchDistance = VISUAL_PLAYER_RADIUS * 0.92;
      ctx.fillStyle = REMOTE_PLAYER_OUTLINE;
      ctx.beginPath();
      ctx.arc(
        x + Math.cos(facingAngle) * notchDistance,
        y + Math.sin(facingAngle) * notchDistance,
        Math.max(1.4, VISUAL_PLAYER_RADIUS * 0.16),
        0,
        Math.PI * 2,
      );
      ctx.fill();

      drawCatchRing(x, y, catchProgress);

      if (showName && identity) drawNameTag(x, y, identity.displayName);
    }

    /** A small pill with the player's name, floating just above their token. */
    function drawNameTag(x: number, y: number, name: string) {
      if (!ctx) return;
      const fontSize = Math.max(9, VISUAL_PLAYER_RADIUS * 0.9);
      ctx.font = `600 ${fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const paddingX = fontSize * 0.5;
      const textWidth = ctx.measureText(name).width;
      const pillHeight = fontSize * 1.5;
      const pillY = y - VISUAL_PLAYER_RADIUS - pillHeight - 4;
      ctx.fillStyle = 'rgba(5, 4, 9, 0.72)';
      ctx.beginPath();
      ctx.roundRect(x - textWidth / 2 - paddingX, pillY, textWidth + paddingX * 2, pillHeight, pillHeight / 2);
      ctx.fill();
      ctx.fillStyle = REMOTE_PLAYER_OUTLINE;
      ctx.fillText(name, x, pillY + pillHeight / 2);
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
    }

    function drawCatchRing(x: number, y: number, progress: number) {
      if (!ctx || progress <= 0) return;
      const radius = VISUAL_PLAYER_RADIUS + 6;
      ctx.strokeStyle = CATCH_RING_COLOR;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, radius, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
      ctx.stroke();
    }

    let lastTimestamp: number | null = null;
    let frameHandle = 0;
    function frame(timestamp: number) {
      const dtSeconds = lastTimestamp === null ? 0 : Math.min((timestamp - lastTimestamp) / 1000, 0.1);
      lastTimestamp = timestamp;
      step(dtSeconds);
      draw();
      frameHandle = window.requestAnimationFrame(frame);
    }
    frameHandle = window.requestAnimationFrame(frame);

    return () => {
      window.cancelAnimationFrame(frameHandle);
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      disposeSnapshot?.();
      disposePlayerCaught?.();
    };
    // `grid` and `online` are treated as fixed for the lifetime of one mount —
    // a new map or a new bridge means a new game, i.e. a fresh canvas instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <canvas ref={canvasRef} className="hide-seek-canvas" aria-label="Saklambaç haritası" role="img" />;
}
