import type { DisplayPlayer } from '../domain/displayPlayer';

interface PlayerListProps {
  players: readonly DisplayPlayer[];
  drawerId: string;
}

/**
 * Oyuncuları isimleriyle gösterir; o turun çizeni parlayan bir kutuda öne
 * çıkar. Gerçek oyuncu listesine/skora bağlanmadan önceki en sade hâli.
 */
export function PlayerList({ players, drawerId }: PlayerListProps) {
  return (
    <div className="player-list">
      {players.map((player) => {
        const isDrawer = player.id === drawerId;
        return (
          <div
            key={player.id}
            className={`player-chip${isDrawer ? ' is-drawer' : ''}`}
            style={{ borderColor: isDrawer ? player.color : undefined }}
          >
            <span className="player-chip-dot" style={{ background: player.color }} />
            <span className="player-chip-name">
              {player.name}
              {player.isYou ? ' (sen)' : ''}
            </span>
            {isDrawer && <span className="player-chip-badge">✏️ çiziyor</span>}
          </div>
        );
      })}
    </div>
  );
}
