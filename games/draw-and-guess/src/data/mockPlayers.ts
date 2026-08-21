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

export function pickRandomDrawer(players: readonly MockPlayer[], excludeId?: string): MockPlayer {
  const pool = players.filter((player) => player.id !== excludeId);
  const source = pool.length > 0 ? pool : players;
  return source[Math.floor(Math.random() * source.length)];
}
