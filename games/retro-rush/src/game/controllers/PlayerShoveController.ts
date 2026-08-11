import type { MatchState, PlayerState } from '../../domain/types';

export interface PlayerShoveConfig {
  range: number;
  horizontalVelocity: number;
  cooldownMs: number;
  hitStunMs: number;
}

export interface PositionedShovePlayer {
  id: string;
  state: PlayerState;
  x: number;
  y: number;
}

interface RankedTarget {
  player: PositionedShovePlayer;
  inFront: boolean;
  distanceSquared: number;
}

export function canAttemptPlayerShove(matchState: MatchState, playerState: PlayerState, pointerBelongsToGameplay: boolean) {
  return pointerBelongsToGameplay && matchState === 'RUNNING' && playerState === 'ACTIVE';
}

export function findShoveTarget(
  source: PositionedShovePlayer,
  candidates: readonly PositionedShovePlayer[],
  facingDirection: -1 | 1,
  config: PlayerShoveConfig,
) {
  const maximumDistanceSquared = config.range * config.range;
  return candidates
    .filter((candidate) => candidate.id !== source.id && candidate.state === 'ACTIVE')
    .map<RankedTarget>((player) => {
      const horizontalDistance = player.x - source.x;
      const verticalDistance = player.y - source.y;
      return {
        player,
        inFront: horizontalDistance * facingDirection >= 0,
        distanceSquared: horizontalDistance ** 2 + verticalDistance ** 2,
      };
    })
    .filter((candidate) => candidate.distanceSquared <= maximumDistanceSquared)
    .sort((left, right) =>
      Number(right.inFront) - Number(left.inFront)
      || left.distanceSquared - right.distanceSquared
      || left.player.id.localeCompare(right.player.id))
    .at(0)?.player;
}

export function shoveVelocityAwayFrom(source: PositionedShovePlayer, target: PositionedShovePlayer, horizontalVelocity: number) {
  const direction = target.x >= source.x ? 1 : -1;
  return direction * Math.abs(Number.isFinite(horizontalVelocity) ? horizontalVelocity : 0);
}

export class PlayerShoveController {
  private lastAppliedAt = Number.NEGATIVE_INFINITY;

  constructor(private readonly config: PlayerShoveConfig) {}

  isReady(now: number) {
    return now - this.lastAppliedAt >= this.config.cooldownMs;
  }

  markApplied(now: number) {
    if (!this.isReady(now)) return false;
    this.lastAppliedAt = now;
    return true;
  }

  reset() {
    this.lastAppliedAt = Number.NEGATIVE_INFINITY;
  }
}
