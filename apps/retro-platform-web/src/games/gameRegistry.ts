import type { GameRuntimeConfig } from './runtimeConfig';

export interface GameDefinition {
  id: string;
  /** A proper noun — shown as-is in every language. */
  name: string;
  /** Path into `i18n/translations.js`, not the text itself, so a new game
   * cannot ship with an English-only description. */
  descriptionKey: string;
  /** Longer blurb for the games page. Same key-not-text rule as above. */
  detailKey: string;
  /** Key of a string array: how a round actually plays out, step by step. */
  stepsKey: string;
  status: 'available' | 'coming-soon';
  /**
   * Smallest number of players the game makes sense with. A number rather than
   * a label so the app can compare it against a room's size later, which a
   * string like "2+ players" could never support.
   */
  minPlayers: number;
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
    detailKey: 'games.retro-rush.detail',
    stepsKey: 'games.retro-rush.steps',
    status: 'available',
    minPlayers: 1,
    visualLabel: 'RR',
    getLaunchUrl: (config) => config.retroRushUrl,
  },
  {
    id: 'spin-the-bottle',
    name: 'Spin the Bottle',
    descriptionKey: 'games.spin-the-bottle.description',
    detailKey: 'games.spin-the-bottle.detail',
    stepsKey: 'games.spin-the-bottle.steps',
    status: 'available',
    minPlayers: 2,
    visualLabel: 'SB',
    getLaunchUrl: (config) => config.spinTheBottleUrl,
  },
  // Placeholders so the vote has real choices while the games are being built.
  // Flip `status` to 'available' and return a real URL once each one exists.
  {
    id: 'pixel-arena',
    name: 'Pixel Arena',
    descriptionKey: 'games.pixel-arena.description',
    detailKey: 'games.pixel-arena.detail',
    stepsKey: 'games.pixel-arena.steps',
    status: 'coming-soon',
    minPlayers: 2,
    visualLabel: 'PA',
    getLaunchUrl: unavailable,
  },
  {
    id: 'sprint-maze',
    name: 'Sprint Maze',
    descriptionKey: 'games.sprint-maze.description',
    detailKey: 'games.sprint-maze.detail',
    stepsKey: 'games.sprint-maze.steps',
    status: 'coming-soon',
    minPlayers: 1,
    visualLabel: 'SM',
    getLaunchUrl: unavailable,
  },
];

export function findGame(gameId: string): GameDefinition | null {
  return gameRegistry.find((game) => game.id === gameId) ?? null;
}
