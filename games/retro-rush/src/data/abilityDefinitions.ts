import type { AbilityDefinition, AbilityId } from '../domain/types';

export const abilityDefinitions: Readonly<Record<AbilityId, AbilityDefinition>> = {
  speed: {
    id: 'speed', name: 'Momentum', targetMode: 'self', cooldownMs: 15_000, durationMs: 3_000,
    icon: '»', description: 'Run faster for three seconds.',
  },
  rocket: {
    id: 'rocket', name: 'Nudge rocket', targetMode: 'direction', cooldownMs: 10_000,
    icon: '➜', description: 'Launch a playful knockback rocket.',
  },
  ask: {
    id: 'ask', name: 'Pass the mic', targetMode: 'player', cooldownMs: 30_000,
    icon: '?', description: 'Invite an active teammate to reflect.',
  },
};
