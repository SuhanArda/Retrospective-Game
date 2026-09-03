import type { CSSProperties } from 'react';
import type { TankBattleGameSnapshot } from '@retro-platform/contracts';
import { FullscreenButton } from './FullscreenButton';

interface Props {
  snapshot: TankBattleGameSnapshot | null;
  localPlayerId: string;
  angle: number;
  power: number;
  connection: string;
}

export function Hud({ snapshot, localPlayerId, angle, power, connection }: Props) {
  if (!snapshot) return <section className="hud hud-loading" role="status"><span className="loading-pip" />SAVAŞ ALANI YÜKLENİYOR</section>;
  const local = snapshot.players.find((player) => player.playerId === localPlayerId);
  const redAlive = snapshot.players.filter((player) => player.team === 'RED' && player.alive).length;
  const blueAlive = snapshot.players.filter((player) => player.team === 'BLUE' && player.alive).length;
  const powerPercent = Math.round((power - 220) / 400 * 100);
  const angleDirection = angle < 0 ? 'AŞAĞI' : angle > 0 ? 'YUKARI' : 'DÜZ';
  const phaseLabel = snapshot.phase === 'RUNNING' ? 'ÇATIŞMA' : snapshot.phase === 'QUESTION' ? 'SESLİ RETRO' : 'SONUÇ';

  return <header className="hud" aria-label="Maç durumu">
    <div className="hud-brand">
      <span className="brand-mark">TB</span>
      <span><strong>TANK BATTLE</strong><small><i className={`connection-dot ${connection === 'çevrimiçi' ? 'online' : ''}`} />{connection}</small></span>
    </div>
    <div className="battle-score" aria-label={`Kırmızı ${redAlive}, Mavi ${blueAlive}`}>
      <span className="team-chip red-team"><i />KIRMIZI <b>{redAlive}</b></span>
      <span className="round-chip"><small>TUR</small><b>{snapshot.roundNumber}</b><em>{phaseLabel}</em></span>
      <span className="team-chip blue-team"><b>{blueAlive}</b> MAVİ<i /></span>
    </div>
    <div className={`player-card ${local?.team === 'RED' ? 'red-player' : 'blue-player'}`}>
      <div className="player-identity"><small>{local?.team === 'RED' ? 'KIRMIZI BİRLİK' : 'MAVİ BİRLİK'}</small><strong>{local?.displayName ?? 'Oyuncu'}</strong></div>
      <div className="health-meter" aria-label={`${local?.health ?? 0} can`}>
        {[0, 1, 2].map((slot) => <span className={slot < (local?.health ?? 0) ? 'full' : ''} key={slot}>♥</span>)}
      </div>
      <span className="facing-indicator">{local?.facing === 'LEFT' ? '◀ SOL' : 'SAĞ ▶'}</span>
    </div>
    <div className="aim-console">
      <div><small>NİŞAN</small><strong>{angleDirection} {Math.abs(Math.round(angle))}°</strong></div>
      <div className="power-readout"><small>ATIŞ GÜCÜ</small><span className="power-track"><i style={{ '--power': `${powerPercent}%` } as CSSProperties} /></span><b>{Math.round(power)}</b></div>
    </div>
    <FullscreenButton className="hud-fullscreen" />
  </header>;
}
