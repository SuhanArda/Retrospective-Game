import type {
  TankBattleGameSnapshot,
  TankBattlePlayerSnapshot,
  TankBattlePoint,
  TankBattleShotSnapshot,
  TankBattleTeam,
} from '@retro-platform/contracts';
import { terrainAt } from './terrain';
import { createProjectileLaunch, PROJECTILE_STEP_MS } from './ProjectileMotion';
import { gameplayConfig } from '../data/gameplayConfig';

const MAP_WIDTH = 1280;
const MAP_HEIGHT = 720;
const TERRAIN_STEP = 8;
const WATER_Y = 650;
const SPAWN_EDGE_INSET = 140;
const TEAM_SPAWN_BAND_RATIO = 0.34;
const SPAWN_SEARCH_RADIUS = 96;
const MINIMUM_SPAWN_GAP = 112;

export { terrainAt } from './terrain';

export function createMockBattle(localPlayerId = 'local'): TankBattleGameSnapshot {
  const terrainHeights = createTerrainHeights(42);
  const base: Omit<TankBattlePlayerSnapshot, 'playerId' | 'displayName' | 'color' | 'team' | 'x' | 'y' | 'facing'> = {
    connected: true, health: 3, alive: true, turretAngle: 42,
    velocityX: 0, velocityY: 0, airborne: false,
  };
  const player = (playerId: string, displayName: string, team: TankBattleTeam, x: number): TankBattlePlayerSnapshot => ({
    ...base, playerId, displayName, team, color: team === 'RED' ? '#ff5964' : '#42a5ff', x, y: 0,
    facing: team === 'RED' ? 'RIGHT' : 'LEFT',
  });
  const terrainSnapshot: TankBattleGameSnapshot = {
    gameSessionId: 'standalone', roundNumber: 1, revision: 1, serverTimeUnixMs: Date.now(),
    phase: 'RUNNING', mapSeed: 42,
    mapWidth: MAP_WIDTH, mapHeight: MAP_HEIGHT, waterY: WATER_Y, terrainStep: TERRAIN_STEP,
    projectiles: [], terrainHeights, players: [],
  };
  const redSpawns = createMockTeamSpawns(terrainSnapshot, 2, true);
  const blueSpawns = createMockTeamSpawns(terrainSnapshot, 2, false);
  const snapshot = {
    ...terrainSnapshot,
    players: [
      player(localPlayerId, 'Sen', 'RED', redSpawns[0]!),
      player('red-bot', 'Kızıl Bot', 'RED', redSpawns[1]!),
      player('blue-bot-1', 'Mavi Bot', 'BLUE', blueSpawns[1]!),
      player('blue-bot-2', 'Lacivert Bot', 'BLUE', blueSpawns[0]!),
    ],
  };
  return { ...snapshot, players: snapshot.players.map((tank) => ({ ...tank, y: terrainAt(snapshot, tank.x) - 12 })) };
}

function createTerrainHeights(seed: number): number[] {
  const seedPhase = Math.abs(seed % 997) / 997 * Math.PI * 2;
  return Array.from({ length: MAP_WIDTH / TERRAIN_STEP + 1 }, (_, index) => {
    const x = index * TERRAIN_STEP;
    return 448 + 60 * Math.sin(x * 0.0088 + seedPhase)
      + 32 * Math.sin(x * 0.0216 + 1.7 + seedPhase * 0.35)
      + 18 * Math.sin(x * 0.0036 + seedPhase * 0.6)
      - 82 * Math.exp(-Math.pow((x - MAP_WIDTH / 2) / 185, 2));
  });
}

function createMockTeamSpawns(snapshot: TankBattleGameSnapshot, count: number, redTeam: boolean): number[] {
  const bandEnd = snapshot.mapWidth * TEAM_SPAWN_BAND_RATIO;
  const spacing = count === 1 ? 0 : (bandEnd - SPAWN_EDGE_INSET) / (count - 1);
  const occupied: number[] = [];
  for (let index = 0; index < count; index++) {
    const leftTarget = SPAWN_EDGE_INSET + index * spacing;
    const target = redTeam ? leftTarget : snapshot.mapWidth - leftTarget;
    const sideMinimum = redTeam ? SPAWN_EDGE_INSET : snapshot.mapWidth * (1 - TEAM_SPAWN_BAND_RATIO);
    const sideMaximum = redTeam ? bandEnd : snapshot.mapWidth - SPAWN_EDGE_INSET;
    let bestX = target;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let offset = -SPAWN_SEARCH_RADIUS; offset <= SPAWN_SEARCH_RADIUS; offset += TERRAIN_STEP) {
      const candidate = Math.max(sideMinimum, Math.min(sideMaximum, target + offset));
      const surface = terrainAt(snapshot, candidate);
      const slope = Math.abs(terrainAt(snapshot, candidate + 20) - terrainAt(snapshot, candidate - 20));
      if (surface >= snapshot.waterY - 32
        || occupied.some((existing) => Math.abs(existing - candidate) < MINIMUM_SPAWN_GAP)) continue;
      const score = slope + Math.abs(offset) * 0.025;
      if (score >= bestScore) continue;
      bestScore = score;
      bestX = candidate;
    }
    occupied.push(bestX);
  }
  return occupied;
}

export function moveMockTank(snapshot: TankBattleGameSnapshot, playerId: string, direction: -1 | 1): TankBattleGameSnapshot {
  if (snapshot.phase !== 'RUNNING') return snapshot;
  const players = snapshot.players.map((tank) => {
    if (tank.playerId !== playerId || !tank.alive) return tank;
    const candidateX = Math.max(36, Math.min(snapshot.mapWidth - 36, tank.x + direction * 12));
    const blocked = snapshot.players.some((other) => other.playerId !== tank.playerId && other.alive
      && other.team !== tank.team && Math.abs(other.x - candidateX) < 30);
    const x = blocked ? tank.x : candidateX;
    return {
      ...tank,
      x,
      y: tank.airborne ? tank.y : terrainAt(snapshot, x) - 12,
      facing: direction < 0 ? 'LEFT' as const : 'RIGHT' as const,
    };
  });
  return { ...snapshot, revision: snapshot.revision + 1, serverTimeUnixMs: Date.now(), players };
}

export function fireMockShot(
  snapshot: TankBattleGameSnapshot,
  playerId: string,
  angle: number,
  power: number,
): TankBattleGameSnapshot {
  const owner = snapshot.players.find((tank) => tank.playerId === playerId);
  if (!owner?.alive || snapshot.phase !== 'RUNNING') return snapshot;
  const simulation = simulateMockShot(snapshot, owner, angle, power);
  const firedAtUnixMs = Date.now();
  const shot: TankBattleShotSnapshot = {
    shotId: `mock-${snapshot.revision + 1}`,
    ownerPlayerId: owner.playerId,
    angle,
    power,
    launch: simulation.launch,
    velocity: simulation.velocity,
    gravity: simulation.gravity,
    path: simulation.path,
    impact: simulation.impact,
    firedAtUnixMs,
    impactAtUnixMs: firedAtUnixMs + simulation.flightMilliseconds,
    status: 'ACTIVE',
    impactType: simulation.impactType,
  };
  return {
    ...snapshot,
    revision: snapshot.revision + 1,
    serverTimeUnixMs: firedAtUnixMs,
    players: snapshot.players.map((tank) => tank.playerId === owner.playerId ? { ...tank, turretAngle: angle } : tank),
    projectiles: [...snapshot.projectiles, shot],
    lastShot: shot,
  };
}

function simulateMockShot(
  snapshot: TankBattleGameSnapshot,
  owner: TankBattlePlayerSnapshot,
  angle: number,
  power: number,
): Pick<TankBattleShotSnapshot, 'launch' | 'velocity' | 'gravity' | 'path' | 'impact' | 'impactType'> & {
  flightMilliseconds: number;
} {
  const { launch, velocity, gravity } = createProjectileLaunch(owner.x, owner.y, owner.facing, angle, power);
  let x = launch.x;
  let y = launch.y;
  const path: TankBattlePoint[] = [{ x, y }];
  let impactType: TankBattleShotSnapshot['impactType'] = 'OUT_OF_BOUNDS';
  let flightMilliseconds = 180 * PROJECTILE_STEP_MS;
  for (let step = 0; step < 180; step++) {
    const elapsedSeconds = (step + 1) * PROJECTILE_STEP_MS / 1_000;
    x = launch.x + velocity.x * elapsedSeconds;
    y = launch.y + velocity.y * elapsedSeconds + 0.5 * gravity * elapsedSeconds * elapsedSeconds;
    if (step % 2 === 0) path.push({ x, y });
    const tankHit = step > 3 && snapshot.players.some((tank) => tank.playerId !== owner.playerId && tank.alive
      && Math.abs(tank.x - x) <= 22 && y >= tank.y - 32 && y <= tank.y + 12);
    let finished = false;
    if (y >= snapshot.waterY + 24) {
      impactType = 'WATER';
      finished = true;
    } else if (x <= 0 || x >= snapshot.mapWidth) {
      impactType = 'OUT_OF_BOUNDS';
      finished = true;
    } else if (tankHit) {
      impactType = 'TANK';
      finished = true;
    } else if (step > 3 && y >= terrainAt(snapshot, x)) {
      impactType = 'TERRAIN';
      finished = true;
    }
    if (finished) {
      flightMilliseconds = (step + 1) * PROJECTILE_STEP_MS;
      path.push({ x: Math.max(0, Math.min(snapshot.mapWidth, x)), y: Math.min(snapshot.waterY + 24, y) });
      break;
    }
  }
  return { launch, velocity, gravity, path, impact: path.at(-1)!, flightMilliseconds, impactType };
}

export function resolveMockShot(snapshot: TankBattleGameSnapshot, shotId: string): TankBattleGameSnapshot {
  const shot = snapshot.projectiles.find((candidate) => candidate.shotId === shotId);
  if (!shot || shot.status !== 'ACTIVE') return snapshot;
  const impacted = shot.impactType === 'TERRAIN' || shot.impactType === 'TANK';
  const resolvedShot: TankBattleShotSnapshot = { ...shot, status: impacted ? 'IMPACTED' : 'MISSED' };
  if (!impacted) {
    return {
      ...snapshot,
      revision: snapshot.revision + 1,
      serverTimeUnixMs: Date.now(),
      projectiles: snapshot.projectiles.map((candidate) => candidate.shotId === shotId ? resolvedShot : candidate),
      lastShot: snapshot.lastShot?.shotId === shotId ? resolvedShot : snapshot.lastShot,
    };
  }
  const owner = snapshot.players.find((tank) => tank.playerId === shot.ownerPlayerId);
  if (!owner) return snapshot;
  const impact = shot.impact;
  const terrainHeights = snapshot.terrainHeights.map((height, index) => {
    const distance = Math.abs(index * snapshot.terrainStep - impact.x);
    if (distance > 44 || impact.y >= snapshot.waterY) return height;
    return Math.min(snapshot.waterY + 12, height + Math.sqrt(44 * 44 - distance * distance) * 0.72);
  });
  const terrainSnapshot = { ...snapshot, terrainHeights };
  const damagedPlayers = snapshot.players.map((tank) => {
    const distance = Math.hypot(tank.x - impact.x, tank.y - impact.y);
    const health = tank.team !== owner.team && tank.alive && distance <= 72 ? tank.health - 1 : tank.health;
    return {
      ...tank,
      health: Math.max(0, health),
      alive: health > 0,
      ...(health > 0 ? {} : { velocityX: 0, velocityY: 0, airborne: false }),
    };
  });
  const players = damagedPlayers.map((tank) => {
    if (!tank.alive) return tank;
    const jumped = applyMockExplosionImpulse(tank, impact);
    return jumped.airborne ? jumped : { ...jumped, y: terrainAt(terrainSnapshot, jumped.x) - 12 };
  });
  const redAlive = players.some((tank) => tank.team === 'RED' && tank.alive);
  const blueAlive = players.some((tank) => tank.team === 'BLUE' && tank.alive);
  const finished = !redAlive || !blueAlive;
  const winnerTeam: TankBattleTeam = redAlive ? 'RED' : blueAlive ? 'BLUE' : owner.team;
  const loserTeam: TankBattleTeam = winnerTeam === 'RED' ? 'BLUE' : 'RED';
  return {
    ...snapshot,
    revision: snapshot.revision + 1,
    serverTimeUnixMs: Date.now(),
    terrainHeights,
    players,
    projectiles: snapshot.projectiles.map((candidate) => candidate.shotId === shotId ? resolvedShot : candidate),
    lastShot: snapshot.lastShot?.shotId === shotId ? resolvedShot : snapshot.lastShot,
    ...(finished ? {
      phase: 'QUESTION' as const,
      result: {
        winnerTeam, loserTeam,
        survivingPlayerIds: players.filter((tank) => tank.alive).map((tank) => tank.playerId),
        eliminatedPlayerIds: players.filter((tank) => !tank.alive).map((tank) => tank.playerId),
      },
      activeQuestion: { questionId: 'mock-question', questionIndex: 0, loserTeam, answeredPlayerIds: [] },
    } : {}),
  };
}

function applyMockExplosionImpulse(
  tank: TankBattlePlayerSnapshot,
  impact: TankBattlePoint,
): TankBattlePlayerSnapshot {
  const deltaX = tank.x - impact.x;
  const distance = Math.hypot(deltaX, tank.y - impact.y);
  const config = gameplayConfig.explosionJump;
  if (distance >= config.impulseRadius) return tank;
  const proximity = 1 - distance / config.impulseRadius;
  const horizontalDirection = Math.abs(deltaX) < 0.001 ? 0 : Math.sign(deltaX);
  const belowTankMultiplier = impact.y >= tank.y - 8 ? 1 : 0.35;
  return {
    ...tank,
    velocityX: Math.max(-config.maxHorizontalSpeed, Math.min(
      config.maxHorizontalSpeed,
      tank.velocityX + horizontalDirection * config.horizontalForce * proximity,
    )),
    velocityY: Math.max(
      tank.velocityY - config.jumpForce * proximity * belowTankMultiplier,
      -config.maxVerticalSpeed,
    ),
    airborne: true,
  };
}

export function advanceMockTankPhysics(
  snapshot: TankBattleGameSnapshot,
  elapsedSeconds: number,
): TankBattleGameSnapshot {
  const delta = Math.max(0, Math.min(elapsedSeconds, 0.2));
  if (delta === 0 || !snapshot.players.some((tank) => tank.alive && tank.airborne)) return snapshot;
  const players = snapshot.players.map((tank) => {
    if (!tank.alive || !tank.airborne) return tank;
    const velocityY = tank.velocityY + gameplayConfig.explosionJump.gravity * delta;
    const x = Math.max(36, Math.min(snapshot.mapWidth - 36, tank.x + tank.velocityX * delta));
    const y = tank.y + velocityY * delta;
    const groundY = terrainAt(snapshot, x) - 12;
    if (y >= groundY && velocityY >= 0) {
      const alive = groundY + 12 < snapshot.waterY - 2;
      return {
        ...tank, x, y: groundY, velocityX: 0, velocityY: 0, airborne: false,
        alive, health: alive ? tank.health : 0,
      };
    }
    const alive = y + 12 < snapshot.waterY - 2;
    return {
      ...tank,
      x,
      y,
      velocityX: alive ? tank.velocityX * Math.pow(0.92, delta) : 0,
      velocityY: alive ? velocityY : 0,
      airborne: alive,
      alive,
      health: alive ? tank.health : 0,
    };
  });
  return {
    ...snapshot,
    revision: snapshot.revision + 1,
    serverTimeUnixMs: Date.now(),
    players,
  };
}

export function resetMockRound(snapshot: TankBattleGameSnapshot): TankBattleGameSnapshot {
  const mapSeed = (snapshot.mapSeed * 1_664_525 + 1_013_904_223) & 0x7fffffff;
  const terrainHeights = createTerrainHeights(mapSeed);
  const red = snapshot.players.filter((player) => player.team === 'RED').sort((left, right) => left.x - right.x);
  const blue = snapshot.players.filter((player) => player.team === 'BLUE').sort((left, right) => right.x - left.x);
  const spawnX = new Map<string, number>();
  const terrainSnapshot = { ...snapshot, mapSeed, terrainHeights };
  const redSpawns = createMockTeamSpawns(terrainSnapshot, red.length, true);
  const blueSpawns = createMockTeamSpawns(terrainSnapshot, blue.length, false);
  red.forEach((player, index) => spawnX.set(player.playerId, redSpawns[index]!));
  blue.forEach((player, index) => spawnX.set(player.playerId, blueSpawns[index]!));
  return {
    ...terrainSnapshot,
    roundNumber: snapshot.roundNumber + 1,
    revision: snapshot.revision + 1,
    serverTimeUnixMs: Date.now(),
    phase: 'RUNNING',
    projectiles: [],
    lastShot: undefined,
    result: undefined,
    activeQuestion: undefined,
    players: snapshot.players.map((player) => {
      const x = spawnX.get(player.playerId) ?? player.x;
      return {
        ...player, x, y: terrainAt(terrainSnapshot, x) - 12, health: 3, alive: true,
        facing: player.team === 'RED' ? 'RIGHT' as const : 'LEFT' as const, turretAngle: 42,
        velocityX: 0, velocityY: 0, airborne: false,
      };
    }),
  };
}
