import type { HideAndSeekRole, HideAndSeekWinner } from '@retro-platform/contracts';

interface ResultsScreenProps {
  winner: HideAndSeekWinner;
  caughtCount: number;
  localRole: HideAndSeekRole;
  isHost: boolean;
  onReturnToGames: () => void;
}

/**
 * Shown once `phase` reaches `ENDED`. Deliberately modest for v1 — winner,
 * a caught count, and (host-only) a way back to the vote screen, the same
 * "Oyunlara Dön" pattern draw-and-guess's results moment uses. A roster with
 * names/roles would need this game's own player list plumbed through from
 * the room snapshot, which nothing here needs yet.
 */
export function ResultsScreen({ winner, caughtCount, localRole, isHost, onReturnToGames }: ResultsScreenProps) {
  const localWon = (winner === 'SEEKER') === (localRole === 'SEEKER');
  return (
    <div className="results-screen">
      <span className="results-title">{winner === 'SEEKER' ? 'Ebe Kazandı!' : 'Saklananlar Kazandı!'}</span>
      <span className={localWon ? 'results-outcome results-outcome-win' : 'results-outcome results-outcome-loss'}>
        {localWon ? 'Kazandın!' : 'Kaybettin.'}
      </span>
      <span className="results-detail">{caughtCount} oyuncu yakalandı</span>
      {isHost && (
        <button type="button" className="results-return-button" onClick={onReturnToGames}>
          Oyunlara Dön
        </button>
      )}
    </div>
  );
}
