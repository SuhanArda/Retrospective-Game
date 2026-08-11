import type { GameRuntimeConfig } from './runtimeConfig';

export interface GameDefinition {
  id: string;
  /** A proper noun — shown as-is in every language. */
  name: string;
  /** Path into `i18n/translations.js`, not the text itself, so a new game
   * cannot ship with an English-only description. */
  descriptionKey: string;
  status: 'available' | 'coming-soon';
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
    descriptionKey: 'games.retro-rush.description',
    status: 'available',
    visualLabel: 'RR',
    getLaunchUrl: (config) => config.retroRushUrl,
  },
  // Placeholders so the vote has real choices while the games are being built.
  // Flip `status` to 'available' and return a real URL once each one exists.
  {
    id: 'pixel-arena',
    name: 'Pixel Arena',
    descriptionKey: 'games.pixel-arena.description',
    status: 'coming-soon',
    visualLabel: 'PA',
    getLaunchUrl: unavailable,
  },
  {
    id: 'sprint-maze',
    name: 'Sprint Maze',
    descriptionKey: 'games.sprint-maze.description',
    status: 'coming-soon',
    visualLabel: 'SM',
    getLaunchUrl: unavailable,
  },
];

export function findGame(gameId: string): GameDefinition | null {
  return gameRegistry.find((game) => game.id === gameId) ?? null;
}
