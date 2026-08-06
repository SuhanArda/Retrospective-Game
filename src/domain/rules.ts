import type { AbilityDefinition, PlayerSnapshot, RetroQuestion } from './types';
import type { Checkpoint } from '../game/map/mapTypes';

export function canUseAbility(definition: AbilityDefinition, lastUsedAt: number | undefined, now: number) {
  return lastUsedAt === undefined || now - lastUsedAt >= definition.cooldownMs;
}

export function isEligibleTarget(player: PlayerSnapshot, actorId: string, protectedUntil = 0, now = Date.now()) {
  return player.id !== actorId && player.state === 'ACTIVE' && protectedUntil <= now;
}

export function validateQuestionResponse(question: RetroQuestion, value: string): string | null {
  const normalized = value.trim();
  if (!normalized) return question.required ? 'Please share a response to continue.' : null;
  if (question.type !== 'text' && !question.options?.includes(normalized)) return 'Choose one of the available options.';
  if (question.type === 'text' && normalized.length > 500) return 'Keep your reflection under 500 characters.';
  return null;
}

export function isBehindCamera(playerX: number, cameraScrollX: number, dangerOffset: number) {
  return playerX < cameraScrollX + dangerOffset;
}

export function selectSafeRespawn(checkpoints: readonly Checkpoint[], latestId: string, dangerX: number): Checkpoint {
  const sorted = [...checkpoints].sort((a, b) => a.x - b.x);
  const latestIndex = Math.max(0, sorted.findIndex((point) => point.id === latestId));
  const latest = sorted[latestIndex];
  if (latest && latest.x >= dangerX + 80) return latest;
  const next = sorted.find((point) => point.x >= dangerX + 180);
  return next ?? sorted[sorted.length - 1] ?? { id: 'start', label: 'Start', x: dangerX + 220, y: 540 };
}

export function canRocketHit(ownerId: string, target: PlayerSnapshot) {
  return target.id !== ownerId && target.state === 'ACTIVE';
}
