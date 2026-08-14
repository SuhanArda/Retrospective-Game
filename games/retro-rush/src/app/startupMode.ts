import type { MatchState } from '../domain/types';

export function shouldShowStandaloneStart(hasLaunchContext: boolean, state: MatchState): boolean {
  return !hasLaunchContext && state === 'WAITING';
}
