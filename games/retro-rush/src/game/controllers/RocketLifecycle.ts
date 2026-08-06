import type { PlayerSnapshot } from '../../domain/types';

export type RocketState = 'ACTIVE' | 'HIT' | 'EXPIRED' | 'DESTROYED';

export interface RocketSnapshot {
  ownerId: string;
  state: RocketState;
}

export interface PositionedPlayer {
  id: string;
  state: PlayerSnapshot['state'];
  x: number;
  y: number;
}

export interface RocketTargetingConfig { maximumTargetDistance: number }

const HITTABLE_STATES = new Set<PlayerSnapshot['state']>(['ACTIVE']);

export function canRocketHitPlayer(rocket: RocketSnapshot, player: PlayerSnapshot) {
  return rocket.state === 'ACTIVE' && rocket.ownerId !== player.id && HITTABLE_STATES.has(player.state);
}

export function resolveRocketHit(rocket: RocketSnapshot, player: PlayerSnapshot) {
  if (!canRocketHitPlayer(rocket, player)) return false;
  rocket.state = 'HIT';
  return true;
}

export function isEligibleRocketTarget(owner: PositionedPlayer, candidate: PositionedPlayer, config: RocketTargetingConfig) {
  if (owner.id === candidate.id || candidate.state !== 'ACTIVE') return false;
  const dx = candidate.x - owner.x;
  const dy = candidate.y - owner.y;
  return Number.isFinite(dx) && Number.isFinite(dy) && dx * dx + dy * dy <= config.maximumTargetDistance ** 2;
}

export function findNearestRocketTarget(owner: PositionedPlayer, players: readonly PositionedPlayer[], config: RocketTargetingConfig) {
  return [...players].filter((candidate) => isEligibleRocketTarget(owner, candidate, config)).sort((left, right) => {
    const leftDistance = (left.x - owner.x) ** 2 + (left.y - owner.y) ** 2;
    const rightDistance = (right.x - owner.x) ** 2 + (right.y - owner.y) ** 2;
    return leftDistance - rightDistance || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  })[0];
}

export function rotateAngleTowards(currentAngle: number, targetAngle: number, maximumDelta: number) {
  const difference = Math.atan2(Math.sin(targetAngle - currentAngle), Math.cos(targetAngle - currentAngle));
  return currentAngle + Math.max(-maximumDelta, Math.min(maximumDelta, difference));
}

export function velocityTowards(from: { x: number; y: number }, to: { x: number; y: number }, speed: number, fallbackDirection = 1) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length <= Number.EPSILON || !Number.isFinite(speed)) return { x: fallbackDirection < 0 ? -Math.abs(speed || 0) : Math.abs(speed || 0), y: 0 };
  return { x: dx / length * speed, y: dy / length * speed };
}

export function calculateHomingVelocity(currentVelocity: { x: number; y: number }, rocketPosition: { x: number; y: number }, targetPosition: { x: number; y: number }, speed: number, turnRate: number, deltaSeconds: number) {
  const currentAngle = Math.atan2(currentVelocity.y, currentVelocity.x);
  const desiredAngle = Math.atan2(targetPosition.y - rocketPosition.y, targetPosition.x - rocketPosition.x);
  const angle = rotateAngleTowards(currentAngle, desiredAngle, Math.max(0, turnRate * deltaSeconds));
  return { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
}
