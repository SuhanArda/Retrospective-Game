import type { MockPlayer } from '../data/mockPlayers';

interface ScoreBoardProps {
  players: readonly MockPlayer[];
  scores: Readonly<Record<string, number>>;
}

/** En yüksek puanlı en üstte — kazananın kim olduğu her an belli olsun diye. */
export function ScoreBoard({ players, scores }: ScoreBoardProps) {
  const ranked = [...players].sort((a, b) => (scores[b.id] ?? 0) - (scores[a.id] ?? 0));

  return (
    <div className="score-board">
      <span className="score-board-title">Skor</span>
      <ol className="score-board-list">
        {ranked.map((player) => (
          <li key={player.id} className="score-board-row">
            <span className="score-board-dot" style={{ background: player.color }} />
            <span className="score-board-name">
              {player.name}
              {player.isYou ? ' (sen)' : ''}
            </span>
            <span className="score-board-points">{scores[player.id] ?? 0}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
