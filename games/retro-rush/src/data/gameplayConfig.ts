export interface GameplayConfig {
  roundStart: { countdownDisplaySeconds: number };
  world: { width: number; height: number; floorY: number; matchDurationMs: number };
  player: {
    gravity: number;
    acceleration: number;
    deceleration: number;
    maxRunSpeed: number;
    jumpVelocity: number;
    jumpCutMultiplier: number;
    coyoteTimeMs: number;
    jumpBufferMs: number;
    maximumFallSpeed: number;
    airborneControlMultiplier: number;
    maximumDeltaSeconds: number;
    respawnDelayMs: number;
    invulnerabilityMs: number;
  };
  camera: { leaderScreenRatio: number; followSharpness: number; maximumCatchUpSpeed: number; leftDangerMargin: number };
  shove: { range: number; horizontalVelocity: number; cooldownMs: number; hitStunMs: number };
  rocket: { speed: number; lifetimeMs: number; rocketKnockbackX: number; hitStunMs: number; maximumTargetDistance: number; homingTurnRateRadiansPerSecond: number; targetReacquireEnabled: boolean; collisionRadius: number; collisionWidth: number; collisionHeight: number; collisionOffsetX: number; collisionOffsetY: number; sweptCollisionEnabled: boolean };
  bot: { answerDelayMs: number };
  proceduralMap: ProceduralMapConfig;
  network: { sendRateHz: number; interpolationDelayMs: number };
}

export interface ProceduralMapConfig {
  chunksAhead: number;
  chunksBehind: number;
  targetChunkLength: number;
  initialRandomChunks: number;
  startPlatformWidth: number;
  platformHeight: number;
  maximumSafeGap: number;
  maximumSafeVerticalRise: number;
  reachabilitySafetyFactor: number;
  difficultyDistanceScale: number;
  verticalLaneCount: number;
  verticalLaneSpacing: number;
  platformWidthVariation: number;
  decorationHorizontalVariation: number;
  recentChunkHistory: number;
  debugChunks: boolean;
}

export const gameplayConfig: GameplayConfig = {
  roundStart: { countdownDisplaySeconds: 3 },
  world: { width: 6800, height: 720, floorY: 620, matchDurationMs: 180_000 },
  player: {
    gravity: 1_400,
    acceleration: 1_450,
    deceleration: 1_900,
    maxRunSpeed: 330,
    jumpVelocity: 650,
    jumpCutMultiplier: 0.55,
    coyoteTimeMs: 120,
    jumpBufferMs: 140,
    maximumFallSpeed: 900,
    airborneControlMultiplier: 0.82,
    maximumDeltaSeconds: 0.05,
    respawnDelayMs: 280,
    invulnerabilityMs: 2_000,
  },
  camera: { leaderScreenRatio: 0.68, followSharpness: 6, maximumCatchUpSpeed: 900, leftDangerMargin: 80 },
  shove: { range: 55, horizontalVelocity: 300, cooldownMs: 600, hitStunMs: 150 },
  rocket: { speed: 520, lifetimeMs: 5_000, rocketKnockbackX: 450, hitStunMs: 250, maximumTargetDistance: 900, homingTurnRateRadiansPerSecond: 2.8, targetReacquireEnabled: true, collisionRadius: 12, collisionWidth: 28, collisionHeight: 20, collisionOffsetX: -2, collisionOffsetY: -2, sweptCollisionEnabled: true },
  bot: { answerDelayMs: 1_400 },
  proceduralMap: {
    chunksAhead: 4,
    chunksBehind: 2,
    targetChunkLength: 760,
    initialRandomChunks: 5,
    startPlatformWidth: 1_000,
    platformHeight: 40,
    maximumSafeGap: 188.45,
    maximumSafeVerticalRise: 113.16,
    reachabilitySafetyFactor: 0.75,
    difficultyDistanceScale: 12_000,
    verticalLaneCount: 3,
    verticalLaneSpacing: 56,
    platformWidthVariation: 12,
    decorationHorizontalVariation: 8,
    recentChunkHistory: 3,
    debugChunks: false,
  },
  network: { sendRateHz: 20, interpolationDelayMs: 100 },
};
