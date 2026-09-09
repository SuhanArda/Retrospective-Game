export function canShowBackToGames(hasLaunchContext: boolean, isHost: boolean): boolean {
  return hasLaunchContext && isHost;
}
