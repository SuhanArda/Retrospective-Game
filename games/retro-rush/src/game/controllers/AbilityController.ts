import { abilityDefinitions } from '../../data/abilityDefinitions';
import type { AbilityId } from '../../domain/types';

export class AbilityController {
  private readonly availableAt = new Map<AbilityId, number>();

  isReady(id: AbilityId, now: number) { return now >= (this.availableAt.get(id) ?? 0); }

  tryUse(id: AbilityId, now: number) {
    if (!this.isReady(id, now)) return false;
    this.availableAt.set(id, now + abilityDefinitions[id].cooldownMs);
    return true;
  }

  cooldowns(now: number): Record<AbilityId, number> {
    return Object.fromEntries(Object.values(abilityDefinitions).map(({ id }) =>
      [id, Math.max(0, (this.availableAt.get(id) ?? 0) - now)])) as Record<AbilityId, number>;
  }

  synchronize(availableAt: Readonly<Record<AbilityId, number>>) {
    Object.entries(availableAt).forEach(([id, deadline]) => this.availableAt.set(id as AbilityId, deadline));
  }

  accept(id: AbilityId, availableAt: number) { this.availableAt.set(id, availableAt); }

  reset(initialUnlockAt = 0) {
    Object.values(abilityDefinitions).forEach(({ id }) => this.availableAt.set(id, initialUnlockAt));
  }
}
