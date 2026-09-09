import type { TankBattleGameSnapshot } from '@retro-platform/contracts';

export function ResultsPanel({ snapshot }: { snapshot: TankBattleGameSnapshot }) {
  if (!snapshot.result) return null;
  const winningPlayers = snapshot.players.filter((player) => player.team === snapshot.result?.winnerTeam);
  const losingPlayers = snapshot.players.filter((player) => player.team === snapshot.result?.loserTeam);
  const winnerLabel = snapshot.result.winnerTeam === 'RED' ? 'KIRMIZI TAKIM' : 'MAVİ TAKIM';
  const winnerClass = snapshot.result.winnerTeam === 'RED' ? 'red-result' : 'blue-result';
  return <section className={`modal result-panel ${winnerClass}`} aria-labelledby="result-title">
    <div className="victory-rays" aria-hidden="true" />
    <div className="trophy" aria-hidden="true">★</div>
    <p className="eyebrow">TUR {snapshot.roundNumber} TAMAMLANDI</p>
    <h1 id="result-title">{winnerLabel} ZAFERİ</h1>
    <p className="result-lead">Savaş alanı sustu. Kaybeden birlik sesli retrospektif sorusunu tamamlayınca yeni tur başlayacak.</p>
    <div className="result-columns">
      <TeamResult title="ZAFER BİRLİĞİ" players={winningPlayers} winning />
      <TeamResult title="ELENEN BİRLİK" players={losingPlayers} />
    </div>
  </section>;
}

function TeamResult({ title, players, winning = false }: {
  title: string;
  players: TankBattleGameSnapshot['players'];
  winning?: boolean;
}) {
  return <div className={`result-team ${winning ? 'winning' : ''}`}><h2>{title}</h2>{players.map((player) => <div className="result-player" key={player.playerId}>
    <span className="result-avatar">{winning ? '★' : '×'}</span>
    <span><strong>{player.displayName}</strong><small>{player.alive ? `${player.health} canla hayatta` : 'Tank elendi'}</small></span>
  </div>)}</div>;
}
