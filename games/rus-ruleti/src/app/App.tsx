import { useEffect, useMemo, useState } from 'react';
import { RoomRealtimeClient } from '@retro-platform/realtime-client';
import { RoomQuestionProvider } from '@retro-platform/realtime-client';
import type { RoomPlayerSnapshot } from '@retro-platform/contracts';
import { FullscreenButton } from './FullscreenButton';
import { GameCanvas } from '../game/GameCanvas';
import { buildOpponentSeats, spriteForLocalPlayer } from './seats';
import { RouletteRoomBridge } from './roomBridge';
import { buildPlatformGameSelectionUrl, resolveRusRuletiLaunchContext, rusRuletiRuntimeConfig } from './platformIntegration';

/**
 * How long the room connection gets before the game opens standalone. The
 * player has just come from the site, so the server is already awake and
 * this normally resolves in milliseconds; the deadline only exists so a
 * connection that never settles cannot leave someone staring at nothing.
 */
const ROOM_DEADLINE_MS = 5_000;

export function App() {
  const launchContext = useMemo(
    () => resolveRusRuletiLaunchContext(window.location.search, window.sessionStorage, window),
    [],
  );
  const roomCode = launchContext?.roomCode ?? null;

  const [roster, setRoster] = useState<readonly RoomPlayerSnapshot[] | null>(null);
  const [bridge, setBridge] = useState<RouletteRoomBridge | null>(null);
  const [roomClient, setRoomClient] = useState<RoomRealtimeClient | null>(null);
  const [roomSettled, setRoomSettled] = useState(false);
  const [roomIsHost, setRoomIsHost] = useState(launchContext?.isHost ?? false);
  const [announcement, setAnnouncement] = useState('');
  // Remembered per-browser so a Teams-call regular doesn't have to re-mute
  // every time they open the game again.
  const [muted, setMuted] = useState(() => {
    try {
      return window.localStorage.getItem('rus-ruleti-muted') === '1';
    } catch {
      return false;
    }
  });
  const toggleMuted = () => {
    setMuted((current) => {
      const next = !current;
      try {
        window.localStorage.setItem('rus-ruleti-muted', next ? '1' : '0');
      } catch {
        // Private-browsing or storage-disabled — the toggle still works for this tab, it just won't be remembered.
      }
      return next;
    });
  };

  useEffect(() => {
    if (!launchContext) { setRoomSettled(true); return; }

    let settled = false;
    const settle = () => { if (settled) return; settled = true; setRoomSettled(true); };
    const deadline = window.setTimeout(settle, ROOM_DEADLINE_MS);

    const client = RoomRealtimeClient.fromLaunchContext(rusRuletiRuntimeConfig.apiUrl, launchContext);
    const roomBridge = new RouletteRoomBridge(client, launchContext.gameSessionId);
    let questionLoadCancelled = false;
    let questionRetryTimer: number | null = null;
    let questionAttempt = 0;
    const loadQuestions = () => {
      void new RoomQuestionProvider(rusRuletiRuntimeConfig.apiUrl)
        .getForRoom(launchContext.roomCode, launchContext.playerId, launchContext.reconnectToken)
        .then((set) => { if (!questionLoadCancelled) roomBridge.setQuestions(set.questions); })
        .catch(() => {
          questionAttempt += 1;
          if (!questionLoadCancelled && questionAttempt < 25) questionRetryTimer = window.setTimeout(loadQuestions, 2_000);
        });
    };
    loadQuestions();
    const disposeRoom = client.on('roomSnapshot', (room) => {
      window.clearTimeout(deadline);
      settle();
      if (room.currentGameSession?.gameSessionId !== launchContext.gameSessionId) return;
      setRoster(room.players);
      setRoomIsHost(room.hostPlayerId === launchContext.playerId);
    });
    const disposeReturn = client.on('returnedToGameSelection', () => {
      window.location.assign(buildPlatformGameSelectionUrl(rusRuletiRuntimeConfig.platformUrl, launchContext.roomCode, window.location.origin));
    });
    setBridge(roomBridge);
    setRoomClient(client);
    void client.connect().then(
      () => { window.clearTimeout(deadline); settle(); setAnnouncement(''); },
      (error: unknown) => {
        // A cancelled connect is this effect tearing down its own client —
        // React re-runs effects once on mount in development — and the
        // replacement client connects immediately after. Reporting it would
        // leave a failure message on screen for a connection that is fine.
        if (error instanceof Error && error.message === 'ROOM_CONNECTION_CANCELLED') return;
        window.clearTimeout(deadline);
        settle();
        setAnnouncement('Oda bağlantısı kurulamadı');
      },
    );

    return () => {
      questionLoadCancelled = true;
      if (questionRetryTimer !== null) window.clearTimeout(questionRetryTimer);
      window.clearTimeout(deadline);
      disposeRoom();
      disposeReturn();
      roomBridge.dispose();
      setBridge(null);
      setRoomClient(null);
      void client.disconnect();
    };
  }, [launchContext]);

  const opponents = useMemo(
    () => buildOpponentSeats(roster, launchContext?.playerId ?? null),
    [roster, launchContext],
  );
  const youSprite = useMemo(
    () => spriteForLocalPlayer(roster, launchContext?.playerId ?? null),
    [roster, launchContext],
  );

  const returnToGames = () => {
    if (!launchContext || !roomClient) return;
    void roomClient.returnToGameSelection().catch(() => setAnnouncement('Oda bağlantısı kurulamadı'));
  };

  return (
    <main className="app-shell">
      {roomSettled && (
        <GameCanvas
          bridge={bridge}
          opponents={launchContext ? opponents : null}
          localPlayerId={launchContext?.playerId ?? null}
          youSprite={launchContext ? youSprite : null}
          muted={muted}
        />
      )}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>Rus Ruleti</h1>
          <p className="subtitle">
            {launchContext
              ? `Oda ${roomCode} · ${roomIsHost ? 'Ev sahibi' : 'Oyuncu'}`
              : 'Yerel prototip — örnek oyuncularla.'}
          </p>
        </div>
        <div className="sidebar-actions">
          <button className="button sound-toggle" type="button" onClick={toggleMuted} aria-label={muted ? 'Sesi aç' : 'Sesi kapat'}>
            {muted ? 'SES KAPALI' : 'SES AÇIK'}
          </button>
          <FullscreenButton className="button fullscreen-toggle" />
        </div>
        {roster && (
          <ul className="sidebar-players">
            {roster.map((player) => (
              <li key={player.id} className={player.id === launchContext?.playerId ? 'is-you' : undefined}>
                {player.displayName}
                {player.id === launchContext?.playerId && ' (Sen)'}
                {player.isHost && ' 👑'}
              </li>
            ))}
          </ul>
        )}
        {launchContext && roomIsHost && (
          <button className="button return-to-platform" type="button" onClick={returnToGames}>Oyunlara Dön</button>
        )}
      </aside>
      {announcement && <div className="toast" role="status" aria-live="polite">{announcement}</div>}
    </main>
  );
}
