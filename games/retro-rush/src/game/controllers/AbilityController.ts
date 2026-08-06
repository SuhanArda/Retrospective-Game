import { abilityDefinitions } from '../../data/abilityDefinitions';
import { canUseAbility } from '../../domain/rules';
import type { AbilityId } from '../../domain/types';

export class AbilityController {
  private readonly lastUsedAt = new Map<AbilityId, number>();

  isReady(id: AbilityId, now: number) { return canUseAbility(abilityDefinitions[id], this.lastUsedAt.get(id), now); }

  tryUse(id: AbilityId, now: number) {
    if (!this.isReady(id, now)) return false;
    this.lastUsedAt.set(id, now);
    return true;
  }

  cooldowns(now: number): Record<AbilityId, number> {
    return Object.fromEntries(Object.values(abilityDefinitions).map((definition) => {
      const elapsed = now - (this.lastUsedAt.get(definition.id) ?? -definition.cooldownMs);
      return [definition.id, Math.max(0, definition.cooldownMs - elapsed)];
    })) as Record<AbilityId, number>;
  }

  reset() { this.lastUsedAt.clear(); }
  grant(id: AbilityId) { this.lastUsedAt.delete(id); }
}
