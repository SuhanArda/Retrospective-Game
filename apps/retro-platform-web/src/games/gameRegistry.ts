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

function unavailable(): never {
  throw new Error('This game has no runtime yet');
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
  // Placeholders so the vote has real choices while the games are being built.
  // Flip `status` to 'available' and return a real URL once each one exists.
  {
    id: 'pixel-arena',
    name: 'Pixel Arena',
    description: 'Last one standing in a shrinking arena — every knockout opens a question.',
    status: 'coming-soon',
    playerCount: '2+ players',
    visualLabel: 'PA',
    getLaunchUrl: unavailable,
  },
  {
    id: 'sprint-maze',
    name: 'Sprint Maze',
    description: 'Find the exit before the timer runs out; dead ends turn into team reflections.',
    status: 'coming-soon',
    playerCount: '1+ players',
    visualLabel: 'SM',
    getLaunchUrl: unavailable,
  },
];

export function findGame(gameId: string): GameDefinition | null {
  return gameRegistry.find((game) => game.id === gameId) ?? null;
}
