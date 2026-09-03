import type { DisplayPlayer } from '../domain/displayPlayer';

export type MockPlayer = DisplayPlayer;

/**
 * Standalone-only sahte oyuncular. Diğer oyunlardaki bot isimleriyle
 * (Ada, Mert, Ece) tutarlı — gerçek oda/oyuncu listesi bağlandığında bu
 * dosya devre dışı kalacak.
 */
export const MOCK_PLAYERS: readonly MockPlayer[] = [
  { id: 'you', name: 'Sen', color: '#5b2a86', isYou: true },
  { id: 'ada', name: 'Ada', color: '#ff8c42' },
  { id: 'mert', name: 'Mert', color: '#2f9e6e' },
  { id: 'ece', name: 'Ece', color: '#c23b6b' },
];

/** Sequential rotation by list order, not random — whoever comes right after `previousDrawerId` on this list, wrapping back to the start. No previous drawer starts the rotation back at the top. */
export function pickNextDrawer(players: readonly MockPlayer[], previousDrawerId?: string): MockPlayer {
  const previousIndex = previousDrawerId ? players.findIndex((player) => player.id === previousDrawerId) : -1;
  return players[(previousIndex + 1) % players.length];
}
