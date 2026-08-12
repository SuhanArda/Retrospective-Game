import type { AbilityDefinition, AbilityId } from '../domain/types';

export const abilityDefinitions: Readonly<Record<AbilityId, AbilityDefinition>> = {
  speed: {
    id: 'speed', name: 'İvme', targetMode: 'self', cooldownMs: 15_000, durationMs: 3_000,
    icon: '»', description: 'Üç saniye boyunca daha hızlı koş.',
  },
  rocket: {
    id: 'rocket', name: 'İtme roketi', targetMode: 'direction', cooldownMs: 10_000,
    icon: '➜', description: 'Rakibini eğlenceli biçimde geri iten bir roket fırlat.',
  },
  ask: {
    id: 'ask', name: 'Sözü devret', targetMode: 'player', cooldownMs: 30_000,
    icon: '?', description: 'Aktif bir ekip arkadaşını düşünmeye davet et.',
  },
};
