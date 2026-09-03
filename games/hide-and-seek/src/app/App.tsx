import { useEffect, useMemo, useRef, useState } from 'react';
import { RoomRealtimeClient } from '@retro-platform/realtime-client';
import type { HideAndSeekRole, HideAndSeekStateSnapshot } from '@retro-platform/contracts';
import { HideSeekCanvas, type HideSeekPlayerIdentity } from '../game/HideSeekCanvas';
import { PhaseHud } from '../components/PhaseHud';
import { PrepCountdown } from '../components/PrepCountdown';
import { ControlsHint } from '../components/ControlsHint';
import { ResultsScreen } from '../components/ResultsScreen';
import { ReturnToLobbyButton } from '../components/ReturnToLobbyButton';
import { MuteButton } from '../components/MuteButton';
import { FullscreenButton } from '../components/FullscreenButton';
import { RoleLegend } from '../components/RoleLegend';
import { HideSeekConfig } from '../domain/config';
import { classicMap, parseTileGrid, type HideSeekTileGrid } from '../domain/map';
import { HideSeekRoomBridge } from './roomBridge';
import { useHideSeekAudio } from './useHideSeekAudio';
import {
  buildAvatarUrl,
  buildPlatformGameSelectionUrl,
  hideAndSeekRuntimeConfig,
  resolveHideAndSeekLaunchContext,
} from './platformIntegration';
// Vite's `?raw` suffix imports a file's exact source text — this is hashed
// and compared against the server's mapHash, never used as render data
// itself. See map.ts's `classicMap` doc comment and the plan's "Harita:
// repoda tek fiziksel dosya" decision.
import classicMapRawText from '../data/maps/classic.json?raw';
import '../styles/App.css';

/** How long the room connection gets before falling back to an error state — mirrors rus-ruleti/draw-and-guess. */
const ROOM_DEADLINE_MS = 5_000;

/** localStorage key for the mute toggle — a per-device preference, so it's remembered across rounds without needing a server round-trip. */
const MUTE_STORAGE_KEY = 'hideseek:muted';

function readStoredMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_STORAGE_KEY) === '1';
  } catch {
    // Private browsing / storage disabled — default to unmuted rather than throwing.
    return false;
  }
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Oda bağlamı varsa (platformdan gerçek bir oda üzerinden açıldıysa) sunucu
 * otoritesiyle senkron oynanır. Yoksa (bağımsız test) tek başına, sunucusuz
 * eski davranış aynen çalışır.
 */
export function App() {
  const launchContext = useMemo(
    () => resolveHideAndSeekLaunchContext(window.location.search, window.sessionStorage, window),
    [],
  );
  return launchContext ? <OnlineGame launchContext={launchContext} /> : <StandaloneGame />;
}

function StandaloneGame() {
  return (
    <div className="page">
      <div className="hud-overlay">
        <span className="brand">Saklambaç</span>
        <ControlsHint text="WASD / ok tuşları ile hareket et — bağımsız deneme" />
      </div>
      <HideSeekCanvas grid={classicMap} />
    </div>
  );
}

interface OnlineGameProps {
  launchContext: NonNullable<ReturnType<typeof resolveHideAndSeekLaunchContext>>;
}

type ConnectionView =
  | { kind: 'connecting' }
  | { kind: 'waiting-for-game' }
  | { kind: 'map-mismatch' }
  | { kind: 'ready'; grid: HideSeekTileGrid; role: HideAndSeekRole }
  | { kind: 'error'; message: string };

function OnlineGame({ launchContext }: OnlineGameProps) {
  const [view, setView] = useState<ConnectionView>({ kind: 'connecting' });
  // The round's phase/countdown, separate from `view` above — `view` is this
  // tab's own connection lifecycle, `gameState` is the server-authoritative
  // round state shared by everyone in the room.
  const [gameState, setGameState] = useState<HideAndSeekStateSnapshot | null>(null);
  const [isHost, setIsHost] = useState(false);
  const bridgeRef = useRef<HideSeekRoomBridge | null>(null);
  const roomClientRef = useRef<RoomRealtimeClient | null>(null);
  const audio = useHideSeekAudio();
  const lastPhaseRef = useRef<string | null>(null);
  const [muted, setMuted] = useState(readStoredMuted);
  // Every `roomSnapshot` broadcast's roster, by playerId — read by
  // `identityFor` below. A ref, not state: `HideSeekCanvas` reads it once at
  // mount through a callback closure (see its own `online` prop doc), so
  // updates need to land in the same object across renders rather than
  // trigger a re-render this canvas wouldn't even see.
  const rosterRef = useRef<Map<string, { displayName: string; avatarId?: string }>>(new Map());

  // Browsers refuse to start audio before a real user gesture — WASD and any
  // click both count, so either one is enough to unlock it, once.
  useEffect(() => {
    const unlockOnce = () => audio.unlock();
    window.addEventListener('keydown', unlockOnce, { once: true });
    window.addEventListener('pointerdown', unlockOnce, { once: true });
    return () => {
      window.removeEventListener('keydown', unlockOnce);
      window.removeEventListener('pointerdown', unlockOnce);
    };
  }, [audio]);

  // Applies on every change *and* once on mount — so a persisted "muted"
  // preference from a previous round actually takes effect immediately,
  // not just from the next explicit toggle.
  useEffect(() => {
    audio.setMuted(muted);
  }, [muted, audio]);

  useEffect(() => {
    if (gameState?.phase === 'REVEAL' && lastPhaseRef.current !== 'REVEAL') audio.playRevealChime();
    // The drone is a loop, not a one-shot — it needs an explicit stop the
    // instant DARK isn't the phase anymore, not just a "play on enter" like
    // every other cue here.
    if (gameState?.phase === 'DARK' && lastPhaseRef.current !== 'DARK') audio.startDarkAmbience();
    if (gameState?.phase !== 'DARK' && lastPhaseRef.current === 'DARK') audio.stopDarkAmbience();
    lastPhaseRef.current = gameState?.phase ?? null;
  }, [gameState?.phase, audio]);

  // The warning riser fires once, `REVEAL_WARNING_SEC` before the *current*
  // DARK phase's own end — scheduled fresh every time DARK starts (its
  // `phaseEndsAtUtc` is different each cycle), and cleared if the phase
  // changes again before that timer would've fired (a catch that ends the
  // round mid-DARK, a disconnect that skips a phase on reconnect).
  useEffect(() => {
    if (gameState?.phase !== 'DARK') return;
    const msUntilWarning = gameState.phaseEndsAtUtc - Date.now() - HideSeekConfig.REVEAL_WARNING_SEC * 1000;
    if (msUntilWarning <= 0) return; // already inside the warning window (e.g. just reconnected) — nothing to schedule
    const timer = window.setTimeout(() => audio.playRevealWarning(), msUntilWarning);
    return () => window.clearTimeout(timer);
  }, [gameState?.phase, gameState?.phaseEndsAtUtc, audio]);

  // Win/lose stinger, once, the moment the round actually ends. Guarded on
  // `localRoleForEnd` rather than reading `view.role` directly inside the
  // effect — `view` is a discriminated union React hooks can't narrow this
  // early, since this effect (like all hooks) is declared before the
  // early-return render branches below that do the narrowing.
  const localRoleForEnd = view.kind === 'ready' ? view.role : undefined;
  useEffect(() => {
    if (!localRoleForEnd || gameState?.phase !== 'ENDED' || !gameState.winner) return;
    const localWon = (gameState.winner === 'SEEKER') === (localRoleForEnd === 'SEEKER');
    if (localWon) audio.playWin(); else audio.playLose();
  }, [localRoleForEnd, gameState?.phase, gameState?.winner, audio]);

  useEffect(() => {
    let cancelled = false;
    let settledConnecting = false;
    const deadline = window.setTimeout(() => {
      if (settledConnecting || cancelled) return;
      settledConnecting = true;
      setView({ kind: 'error', message: 'Oda bağlantısı kurulamadı' });
    }, ROOM_DEADLINE_MS);

    const client = RoomRealtimeClient.fromLaunchContext(hideAndSeekRuntimeConfig.apiUrl, launchContext);
    roomClientRef.current = client;
    const bridge = new HideSeekRoomBridge(client);
    bridgeRef.current = bridge;

    const disposeGameStarted = bridge.onGameStarted((event) => {
      void (async () => {
        // Compare the exact bytes of our own bundled map file against the
        // server's copy — a mismatch means this client would be walking
        // through walls the server doesn't agree are there, so this must
        // fail loudly rather than quietly rendering a different layout.
        const localHash = await sha256Hex(classicMapRawText);
        if (cancelled) return;
        if (localHash !== event.map.mapHash) {
          setView({ kind: 'map-mismatch' });
          return;
        }
        const grid = parseTileGrid(event.map);
        const isSeeker = event.state.seekerPlayerId === launchContext.playerId;
        setView({ kind: 'ready', grid, role: isSeeker ? 'SEEKER' : 'HIDER' });
      })();
    });
    const disposeStateChanged = bridge.onStateChanged(setGameState);
    const disposePlayerCaught = bridge.onPlayerCaught(() => audio.playCatch());
    const disposeRoomSnapshot = client.on('roomSnapshot', (room) => {
      setIsHost(room.hostPlayerId === launchContext.playerId);
      rosterRef.current = new Map(
        room.players.map((player) => [player.id, { displayName: player.displayName, avatarId: player.avatarId }]),
      );
    });
    const disposeReturnedToSelection = client.on('returnedToGameSelection', () => {
      window.location.assign(
        buildPlatformGameSelectionUrl(hideAndSeekRuntimeConfig.platformUrl, launchContext.roomCode, window.location.origin),
      );
    });

    void client.connect().then(
      () => {
        window.clearTimeout(deadline);
        settledConnecting = true;
        if (!cancelled) setView((current) => (current.kind === 'connecting' ? { kind: 'waiting-for-game' } : current));
      },
      (error: unknown) => {
        // A cancelled connect is this effect tearing down its own client —
        // React re-runs effects once on mount in development.
        if (error instanceof Error && error.message === 'ROOM_CONNECTION_CANCELLED') return;
        window.clearTimeout(deadline);
        settledConnecting = true;
        if (!cancelled) setView({ kind: 'error', message: 'Oda bağlantısı kurulamadı' });
      },
    );

    return () => {
      cancelled = true;
      window.clearTimeout(deadline);
      disposeGameStarted();
      disposeStateChanged();
      disposePlayerCaught();
      disposeRoomSnapshot();
      disposeReturnedToSelection();
      bridge.dispose();
      bridgeRef.current = null;
      roomClientRef.current = null;
      void client.disconnect();
    };
  }, [launchContext]);

  if (view.kind === 'connecting' || view.kind === 'waiting-for-game') {
    return (
      <div className="page">
        <div className="page-content-centered">
          <span className="brand">Saklambaç</span>
          <p className="hint">Odaya bağlanılıyor…</p>
        </div>
      </div>
    );
  }

  if (view.kind === 'error') {
    return (
      <div className="page">
        <div className="page-content-centered">
          <span className="brand">Saklambaç</span>
          <p className="hint" role="status">{view.message}</p>
        </div>
      </div>
    );
  }

  if (view.kind === 'map-mismatch') {
    return (
      <div className="page">
        <div className="page-content-centered">
          <span className="brand">Saklambaç</span>
          <p className="hint" role="alert">
            Harita sürümü uyuşmuyor. Sayfayı yenileyip tekrar deneyin; sorun sürerse bir güncelleme dağıtımı yarım kalmış olabilir.
          </p>
        </div>
      </div>
    );
  }

  function toggleMuted() {
    setMuted((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(MUTE_STORAGE_KEY, next ? '1' : '0');
      } catch {
        // Private browsing / storage disabled — the toggle still works for this session, just won't be remembered.
      }
      return next;
    });
  }

  function handleReturnToGames() {
    void roomClientRef.current?.returnToGameSelection().catch(() => setView({ kind: 'error', message: 'Oda bağlantısı kurulamadı' }));
  }

  // Read fresh off `rosterRef` on every call rather than closing over the
  // roster itself — `HideSeekCanvas` grabs whatever function is in `online`
  // once, at mount, and calls it every frame after that; only a lookup that
  // re-reads the ref on each call keeps seeing roster updates that arrive
  // later (a late join, a changed avatar) instead of a stale snapshot.
  function identityFor(playerId: string): HideSeekPlayerIdentity | undefined {
    const entry = rosterRef.current.get(playerId);
    if (!entry) return undefined;
    return {
      displayName: entry.displayName,
      avatarUrl: entry.avatarId ? buildAvatarUrl(hideAndSeekRuntimeConfig.platformUrl, entry.avatarId) : undefined,
    };
  }

  return (
    <div className="page">
      <div className="hud-overlay">
        <span className="brand">Saklambaç</span>
        {gameState
          ? <PhaseHud phase={gameState.phase} phaseEndsAtUtc={gameState.phaseEndsAtUtc} role={view.role} />
          : <span className="hint">{view.role === 'SEEKER' ? 'Sen ebesin' : 'Saklan!'}</span>}
      </div>
      {gameState?.phase !== 'ENDED' && <ReturnToLobbyButton isHost={isHost} onReturn={handleReturnToGames} />}
      <MuteButton muted={muted} onToggle={toggleMuted} />
      <FullscreenButton className="fullscreen-button" />
      <RoleLegend localRole={view.role} />
      <HideSeekCanvas
        key={launchContext.gameSessionId}
        grid={view.grid}
        phase={gameState?.phase}
        online={{
          bridge: bridgeRef.current!,
          localPlayerId: launchContext.playerId,
          localRole: view.role,
          identityFor,
          onLocalStep: audio.playFootstep,
        }}
      />
      {gameState && <PrepCountdown phase={gameState.phase} phaseEndsAtUtc={gameState.phaseEndsAtUtc} />}
      {/* The top-left corner is already busy with the phase HUD and (for the
          host) the lobby button, so this one-time teaching moment shows as a
          bottom-center toast instead — never competing with either for
          space. `gameState` only ever flips from null to set-once, so this
          mounts exactly once per round, right as movement actually matters. */}
      {gameState && <ControlsHint text="WASD / ok tuşları ile hareket et" variant="toast" />}
      {gameState?.phase === 'ENDED' && gameState.winner && (
        <ResultsScreen
          winner={gameState.winner}
          caughtCount={gameState.caughtPlayerIds.length}
          localRole={view.role}
          isHost={isHost}
          onReturnToGames={handleReturnToGames}
        />
      )}
    </div>
  );
}
