import { abilityDefinitions } from '../data/abilityDefinitions';
import type { MatchSnapshot } from '../domain/types';
import { matchStateLabels, playerStateLabels } from './retroRushLabels';

interface Props { snapshot: MatchSnapshot; muted: boolean; onMute: () => void; onAbility: (id: 'speed' | 'rocket' | 'pull') => void }

function formatTime(milliseconds: number) {
  const total = Math.ceil(milliseconds / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function Hud({ snapshot, muted, onMute, onAbility }: Props) {
  return (
    <>
      <header className="top-hud">
        <div className="brand"><span className="brand-mark">R</span><div><strong>RETRO RUSH</strong><small>YOSUNLU ORMAN KOŞUSU</small></div></div>
        <div className="match-meta"><span><small>ODA</small><strong>DX-204</strong></span><span><small>AŞAMA</small><strong>{matchStateLabels[snapshot.state]}</strong></span><span className="timer"><small>SÜRE</small><strong>{formatTime(snapshot.timeRemainingMs)}</strong></span></div>
        <button className="icon-button" type="button" onClick={onMute} aria-label={muted ? 'Sesi aç' : 'Sesi kapat'}>{muted ? 'SES KAPALI' : 'SES AÇIK'}</button>
        <div className="abilities" aria-label="Yetenekler">
          {Object.values(abilityDefinitions).map((ability, index) => {
            const cooldown = snapshot.cooldowns[ability.id];
            const initiallyLocked = snapshot.abilityInitialLockRemainingMs > 0;
            const ready = !initiallyLocked && cooldown <= 0;
            const status = initiallyLocked
              ? `KİLİTLİ ${Math.ceil(snapshot.abilityInitialLockRemainingMs / 1000)} sn`
              : ready ? 'HAZIR' : `${Math.ceil(cooldown / 1000)} sn`;
            return <button type="button" key={ability.id} className="ability" disabled={!ready || snapshot.state !== 'RUNNING'} onClick={() => onAbility(ability.id)} aria-label={`${ability.name}: ${ability.description}`}><kbd>{index + 1}</kbd><span className="ability-icon">{ability.icon}</span><span><strong>{ability.name}</strong><small>{status}</small></span></button>;
          })}
        </div>
      </header>
      <aside className="player-list" aria-label="Oyuncular">
        {snapshot.players.map((player) => <div className={`player-row ${player.isLocal ? 'local' : ''}`} key={player.id}><span><strong>{player.name}</strong><small>{playerStateLabels[player.state]}</small></span><i className={`status-dot state-${player.state.toLowerCase()}`} /></div>)}
      </aside>
      {snapshot.danger && snapshot.state === 'RUNNING' && <div className="danger-banner" role="status">İLERLE — KAMERA SINIRI YAKINDA</div>}
      <div className="bottom-hud">
        <div className="mode"><span className="status-dot online" /> DENEME MODU<small>YEREL SİMÜLASYON</small></div>
      </div>
    </>
  );
}
