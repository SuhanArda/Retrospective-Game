import { abilityDefinitions } from '../../data/abilityDefinitions';
import { canUseAbility } from '../../domain/rules';
import type { AbilityId } from '../../domain/types';

export class AbilityController {
  private readonly lastUsedAt = new Map<AbilityId, number>();
  private readonly owned = new Set<AbilityId>();

  isOwned(id: AbilityId) { return this.owned.has(id); }
  isReady(id: AbilityId, now: number) { return this.isOwned(id) && canUseAbility(abilityDefinitions[id], this.lastUsedAt.get(id), now); }

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

  ownedAbilities(): readonly AbilityId[] {
    return Object.values(abilityDefinitions).map(({ id }) => id).filter((id) => this.owned.has(id));
  }

  restore(ids: readonly AbilityId[]) {
    const restored = new Set(ids);
    this.owned.clear();
    restored.forEach((id) => this.owned.add(id));
    for (const id of this.lastUsedAt.keys()) if (!this.owned.has(id)) this.lastUsedAt.delete(id);
  }

  reset() { this.lastUsedAt.clear(); this.owned.clear(); }
  grant(id: AbilityId) { this.owned.add(id); this.lastUsedAt.delete(id); }
}
