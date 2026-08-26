import type { MatchSnapshot } from '../domain/types';

interface Props { snapshot: MatchSnapshot }

export function ResultsScreen({ snapshot }: Props) {
  const ordered = [...snapshot.players]
    .filter((player) => player.finishPosition !== undefined)
    .sort((left, right) => left.finishPosition! - right.finishPosition!);
  const lastPlace = ordered.length;

  return (
    <div className="modal-backdrop results-backdrop">
      <section className="dialog results" role="dialog" aria-modal="true" aria-labelledby="results-title">
        <p className="eyebrow">Parkur tamamlandı</p>
        <h2 id="results-title">ROUND SONUCU</h2>
        <p className="gentle-note">Sıralama sunucu tarafından kesinleştirildi. Son sıradaki oyuncu retrospektif sorusunu yanıtlayacak.</p>
        <ol className="standings authoritative-standings">
          {ordered.map((player) => {
            const place = player.finishPosition!;
            const highlight = place === 1 ? 'winner' : place === lastPlace ? 'last-place' : '';
            return (
              <li className={`${highlight} ${player.isLocal ? 'local-player' : ''}`} key={player.id}>
                <strong className="standing-place">{place}.</strong>
                <span className="standing-icon" style={{ color: `#${player.color.toString(16).padStart(6, '0')}` }}>{player.icon}</span>
                <span><strong>{player.name}</strong><small>{place === 1 ? 'Kazanan' : place === lastPlace ? 'Retrospektif sorusu sahibi' : `${place}. sıra`}{player.isLocal ? ' · Sen' : ''}</small></span>
              </li>
            );
          })}
        </ol>
        <p className="results-waiting" role="status">SORU HAZIRLANIYOR...</p>
      </section>
    </div>
  );
}
