import type { HideAndSeekRole, HideAndSeekWinner } from '@retro-platform/contracts';

interface ResultsScreenProps {
  winner: HideAndSeekWinner;
  caughtCount: number;
  localRole: HideAndSeekRole;
  isHost: boolean;
  onPlayAgain: () => void;
  onReturnToGames: () => void;
}

/**
 * Shown once `phase` reaches `ENDED`. Deliberately modest for v1 — winner,
 * a caught count, and (host-only) two ways out: another round with the same
 * players, or back to the vote screen the same "Oyunlara Dön" way
 * draw-and-guess's results moment does it. A roster with names/roles would
 * need this game's own player list plumbed through from the room snapshot,
 * which nothing here needs yet.
 */
export function ResultsScreen({ winner, caughtCount, localRole, isHost, onPlayAgain, onReturnToGames }: ResultsScreenProps) {
  const localWon = (winner === 'SEEKER') === (localRole === 'SEEKER');
  return (
    <div className="results-screen">
      <span className="results-title">{winner === 'SEEKER' ? 'Ebe Kazandı!' : 'Saklananlar Kazandı!'}</span>
      <span className={localWon ? 'results-outcome results-outcome-win' : 'results-outcome results-outcome-loss'}>
        {localWon ? 'Kazandın!' : 'Kaybettin.'}
      </span>
      <span className="results-detail">{caughtCount} oyuncu yakalandı</span>
      {isHost ? (
        <div className="results-actions">
          <button type="button" className="results-button results-button-primary" onClick={onPlayAgain}>
            Tekrar Oyna
          </button>
          <button type="button" className="results-button" onClick={onReturnToGames}>
            Oyunlara Dön
          </button>
        </div>
      ) : (
        <span className="results-detail">Oda kurucusu yeni turu başlatabilir.</span>
      )}
    </div>
  );
}
