import { useEffect, useRef } from 'react';
import type { PlayerSnapshot } from '../domain/types';
import { isEligibleTarget } from '../domain/rules';

interface Props {
  players: readonly PlayerSnapshot[];
  protectedTargets: Readonly<Record<string, number>>;
  onSelect: (id: string) => void;
  onCancel: () => void;
}

export function TargetSelection({ players, protectedTargets, onSelect, onCancel }: Props) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => titleRef.current?.focus(), []);
  return (
    <div className="modal-backdrop">
      <section className="dialog target-dialog" role="dialog" aria-modal="true" aria-labelledby="target-title">
        <p className="eyebrow">Sözü devret</p>
        <h2 id="target-title" ref={titleRef} tabIndex={-1}>Bir ekip arkadaşını düşünmeye davet et</h2>
        <p className="gentle-note">Uygun bir koşucu seç. Kısa soru göstergesinin ardından oyunu devam eder.</p>
        <div className="target-grid">
          {players.filter((player) => !player.isLocal).map((player) => {
            const eligible = isEligibleTarget(player, 'local', protectedTargets[player.id]);
            return <button key={player.id} className="target-card" disabled={!eligible} onClick={() => onSelect(player.id)}>
              <span className="target-icon" aria-hidden="true">{player.icon}</span><strong>{player.name}</strong><small>{eligible ? 'Hazır' : 'Kullanılamıyor'}</small>
            </button>;
          })}
        </div>
        <button className="button ghost" type="button" onClick={onCancel}>İptal</button>
      </section>
    </div>
  );
}
