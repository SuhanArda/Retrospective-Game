import { GameLauncher } from './GameLauncher';
import { gameRuntimeConfig } from './runtimeConfig';

export const gameLauncher = new GameLauncher(
  gameRuntimeConfig,
  window.sessionStorage,
  window.location.origin,
  (url) => window.location.assign(url),
  undefined,
  window,
);
