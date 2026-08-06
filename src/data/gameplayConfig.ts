export interface GameplayConfig {
  world: { width: number; height: number; floorY: number; matchDurationMs: number };
  player: {
    gravity: number;
    acceleration: number;
    deceleration: number;
    maxRunSpeed: number;
    jumpVelocity: number;
    coyoteTimeMs: number;
    jumpBufferMs: number;
    respawnDelayMs: number;
    invulnerabilityMs: number;
  };
  camera: { baseSpeed: number; maxSpeed: number; acceleration: number; dangerOffset: number };
  rocket: { speed: number; lifetimeMs: number; knockbackX: number; knockbackY: number };
  bot: { answerDelayMs: number };
}

export const gameplayConfig: GameplayConfig = {
  world: { width: 6800, height: 720, floorY: 620, matchDurationMs: 180_000 },
  player: {
    gravity: 1_600,
    acceleration: 1_450,
    deceleration: 1_900,
    maxRunSpeed: 330,
    jumpVelocity: 610,
    coyoteTimeMs: 120,
    jumpBufferMs: 140,
    respawnDelayMs: 280,
    invulnerabilityMs: 2_000,
  },
  camera: { baseSpeed: 45, maxSpeed: 118, acceleration: 0.5, dangerOffset: 84 },
  rocket: { speed: 590, lifetimeMs: 1_800, knockbackX: 390, knockbackY: 300 },
  bot: { answerDelayMs: 1_400 },
};
