import type { AbilityDefinition, AbilityId } from '../domain/types';

export const abilityDefinitions: Readonly<Record<AbilityId, AbilityDefinition>> = {
  speed: {
    id: 'speed', name: 'İvme', targetMode: 'self', cooldownMs: 8_000, durationMs: 3_000,
    icon: '»', description: 'Üç saniye boyunca daha hızlı koş.',
  },
  rocket: {
    id: 'rocket', name: 'İtme roketi', targetMode: 'direction', cooldownMs: 10_000,
    icon: '➜', description: 'Rakibini eğlenceli biçimde geri iten bir roket fırlat.',
  },
  pull: {
    id: 'pull', name: 'Lideri geri çek', targetMode: 'automatic', cooldownMs: 12_000,
    icon: '«', description: 'Öndeki lideri güvenli biçimde geriye doğru iter.',
  },
};
