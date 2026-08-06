import { abilityDefinitions } from '../data/abilityDefinitions';
import type { MatchSnapshot } from '../domain/types';

interface Props { snapshot: MatchSnapshot; muted: boolean; onMute: () => void; onAbility: (id: 'speed' | 'rocket' | 'ask') => void }

function formatTime(milliseconds: number) {
  const total = Math.ceil(milliseconds / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function Hud({ snapshot, muted, onMute, onAbility }: Props) {
  const local = snapshot.players.find((player) => player.isLocal);
  return (
    <>
      <header className="top-hud">
        <div className="brand"><span className="brand-mark">R</span><div><strong>RETRO RUSH</strong><small>MOSSWOOD RUN</small></div></div>
        <div className="match-meta"><span><small>ROOM</small><strong>DX-204</strong></span><span><small>PHASE</small><strong>{snapshot.state}</strong></span><span className="timer"><small>TIME</small><strong>{formatTime(snapshot.timeRemainingMs)}</strong></span></div>
        <button className="icon-button" type="button" onClick={onMute} aria-label={muted ? 'Unmute sound' : 'Mute sound'}>{muted ? 'SOUND OFF' : 'SOUND ON'}</button>
      </header>
      <aside className="player-list" aria-label="Players">
        {snapshot.players.map((player) => <div className={`player-row ${player.isLocal ? 'local' : ''}`} key={player.id}><span>{player.icon}</span><span><strong>{player.name}</strong><small>{player.state.replaceAll('_', ' ')}</small></span><i className={`status-dot state-${player.state.toLowerCase()}`} /></div>)}
      </aside>
      {snapshot.danger && snapshot.state === 'RUNNING' && <div className="danger-banner" role="status">KEEP MOVING — CAMERA EDGE NEARBY</div>}
      <div className="bottom-hud">
        <div className="checkpoint"><small>CHECKPOINT</small><strong>{snapshot.checkpointLabel}</strong><span>{local?.eliminations ?? 0} reflections prompted</span></div>
        <div className="abilities" aria-label="Abilities">
          {Object.values(abilityDefinitions).map((ability, index) => {
            const cooldown = snapshot.cooldowns[ability.id];
            const ready = cooldown <= 0;
            return <button type="button" key={ability.id} className="ability" disabled={!ready || snapshot.state !== 'RUNNING'} onClick={() => onAbility(ability.id)} aria-label={`${ability.name}: ${ability.description}`}><kbd>{index + 1}</kbd><span className="ability-icon">{ability.icon}</span><span><strong>{ability.name}</strong><small>{ready ? 'READY' : `${Math.ceil(cooldown / 1000)}s`}</small></span></button>;
          })}
        </div>
        <div className="mode"><span className="status-dot online" /> MOCK MODE<small>LOCAL SIMULATION</small></div>
      </div>
    </>
  );
}
