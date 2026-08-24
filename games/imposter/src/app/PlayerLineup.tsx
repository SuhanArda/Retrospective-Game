import type { CSSProperties } from 'react';
import type { ImposterPlayer } from '../domain/types';
import { Avatar } from './Avatar';

interface PlayerLineupProps {
  players: readonly ImposterPlayer[];
  activePlayerId?: string;
}

export function PlayerLineup({ players, activePlayerId }: PlayerLineupProps) {
  const lineupStyle = {
    '--lineup-slots': players.length + 1,
    '--lineup-width': `${(players.length + 1) * 95}px`,
  } as CSSProperties;

  return (
    <div className="player-arc" style={lineupStyle} aria-label="Oyuncular">
      {players.map((player, index) => {
        const style = {
          gridColumn: `${index + 1} / span 2`,
          gridRow: index % 2 === 0 ? 2 : 1,
          zIndex: index % 2 === 0 ? 2 : 1,
        } as CSSProperties;
        return (
          <div
            className={`arc-player ${player.id === activePlayerId ? 'is-active' : ''} ${player.isConnected ? '' : 'is-disconnected'}`}
            style={style}
            key={player.id}
          >
            <Avatar
              avatarIndex={player.avatarIndex}
              name={player.displayName}
              active={player.id === activePlayerId}
            />
          </div>
        );
      })}
    </div>
  );
}
