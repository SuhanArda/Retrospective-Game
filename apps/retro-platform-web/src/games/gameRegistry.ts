import type { GameRuntimeConfig } from './runtimeConfig';

export interface GameDefinition {
  id: string;
  name: string;
  description: string;
  status: 'available' | 'coming-soon';
  playerCount: string;
  visualLabel: string;
  getLaunchUrl(config: GameRuntimeConfig): string;
}

export const gameRegistry: readonly GameDefinition[] = [
  {
    id: 'retro-rush',
    name: 'Retro Rush',
    description:
      'Race through a moving platform course, use abilities, and answer retrospective questions together.',
    status: 'available',
    playerCount: '1+ players',
    visualLabel: 'RR',
    getLaunchUrl: (config) => config.retroRushUrl,
  },
];

export function findGame(gameId: string): GameDefinition | null {
  return gameRegistry.find((game) => game.id === gameId) ?? null;
}
