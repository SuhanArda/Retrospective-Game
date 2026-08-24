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
  /** Optional upper bound enforced by both the vote UI and room authority. */
  maxPlayers?: number;
  visualLabel: string;
  /**
   * Real screenshot for the games page's showcase card, e.g. `/screenshots/retro-rush.jpg`.
   * Drop the file into `public/screenshots/` and point this at it — no import
   * needed. Left unset until a game has one; the card then falls back to the
   * gradient + visualLabel placeholder.
   */
  screenshotUrl?: string;
  /**
   * Wide (~3:2) cover for the in-room vote screen's full-bleed card, e.g.
   * `/screenshots/retro-rush-wide.jpg`. Same drop-in-`public/screenshots/`
   * rule as `screenshotUrl`. Left unset until a game has one; the card then
   * falls back to the gradient + visualLabel placeholder.
   */
  voteScreenshotUrl?: string;
  getLaunchUrl(config: GameRuntimeConfig): string;
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
    screenshotUrl: '/screenshots/retro-rush.jpg',
    voteScreenshotUrl: '/screenshots/retro-rush-wide.jpg',
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
    screenshotUrl: '/screenshots/spin-the-bottle.jpg',
    voteScreenshotUrl: '/screenshots/spin-the-bottle-wide.jpg',
    getLaunchUrl: (config) => config.spinTheBottleUrl,
  },
  {
    id: 'rus-ruleti',
    name: 'Rus Ruleti',
    descriptionKey: 'games.rus-ruleti.description',
    detailKey: 'games.rus-ruleti.detail',
    stepsKey: 'games.rus-ruleti.steps',
    status: 'available',
    minPlayers: 2,
    visualLabel: 'RU',
    screenshotUrl: '/screenshots/rus-ruleti.jpg',
    voteScreenshotUrl: '/screenshots/rus-ruleti-wide.jpg',
    getLaunchUrl: (config) => config.rusRuletiUrl,
  },
  {
    id: 'imposter',
    name: 'Imposter',
    descriptionKey: 'games.imposter.description',
    detailKey: 'games.imposter.detail',
    stepsKey: 'games.imposter.steps',
    status: 'available',
    minPlayers: 3,
    maxPlayers: 10,
    visualLabel: 'IM',
    screenshotUrl: '/screenshots/imposter-v2.png',
    voteScreenshotUrl: '/screenshots/imposter-wide-v2.png',
    getLaunchUrl: (config) => config.imposterUrl,
  },
];

export function findGame(gameId: string): GameDefinition | null {
  return gameRegistry.find((game) => game.id === gameId) ?? null;
}
