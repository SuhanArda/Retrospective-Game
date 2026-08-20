import { useEffect, useMemo, useState } from 'react';
import { GameCanvas } from '../game/GameCanvas';
import { GameEventBridge } from '../bridge/GameEventBridge';
import { MockGameTransport } from '../networking/MockGameTransport';
import { SignalRGameTransport } from '../networking/SignalRGameTransport';
import { buildPlatformGameSelectionUrl, runtimeConfig } from './runtimeConfig';
import type { ConnectionStatus, MatchSnapshot, PresentedRetroQuestion, RetroQuestion } from '../domain/types';
import { Hud } from '../ui/Hud';
import { QuestionOverlay } from '../ui/QuestionOverlay';
import { TargetSelection } from '../ui/TargetSelection';
import { ResultsScreen } from '../ui/ResultsScreen';
import { BackToGamesButton } from '../ui/BackToGamesButton';
import { consumeGameHandoff, resolveGameLaunchContext } from '@retro-platform/contracts';
import { RoomRealtimeClient } from '@retro-platform/realtime-client';
import { connectionStatusLabels, localizeUserError } from '../ui/retroRushLabels';
import { retroQuestions } from '../data/retroQuestions';
import { loadRoomQuestions } from '../data/roomQuestions';
import { shouldShowStandaloneStart } from './startupMode';
import { gameplayConfig } from '../data/gameplayConfig';

const emptySnapshot: MatchSnapshot = { state: 'LOADING', timeRemainingMs: 180_000, countdown: gameplayConfig.roundStart.countdownDisplaySeconds, players: [], checkpointLabel: 'Başlangıç Noktası', danger: false, ownedAbilities: [], cooldowns: { speed: 0, rocket: 0, ask: 0 } };

export function App() {
  const launchContext = useMemo(() => consumeGameHandoff(window, window.sessionStorage) ?? resolveGameLaunchContext(window.location.search, window.sessionStorage), []);
  const roomCode = launchContext?.roomCode ?? 'DX-204';
  const playerName = launchContext?.displayName ?? 'Yerel Oyuncu';
  const bridge = useMemo(() => new GameEventBridge(), []);
  const roomClient = useMemo(() => launchContext
    ? RoomRealtimeClient.fromLaunchContext(runtimeConfig.roomApiUrl, launchContext)
    : null, [launchContext]);
  const transport = useMemo(() => roomClient && launchContext
    ? new SignalRGameTransport(roomClient, launchContext)
    : new MockGameTransport(), [launchContext, roomClient]);
  const [snapshot, setSnapshot] = useState(emptySnapshot);
  const [question, setQuestion] = useState<PresentedRetroQuestion | null>(null);
  const [targeting, setTargeting] = useState<Readonly<Record<string, number>> | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [connection, setConnection] = useState<ConnectionStatus>('disconnected');
  const [muted, setMuted] = useState(false);
  const [roomIsHost, setRoomIsHost] = useState(false);
  const [authoritativeMapSeed, setAuthoritativeMapSeed] = useState<number | null>(null);
  const [sessionQuestions, setSessionQuestions] = useState<readonly RetroQuestion[]>(retroQuestions);

  useEffect(() => {
    if (!launchContext?.roomCode) {
      setSessionQuestions(retroQuestions);
      return;
    }
    let cancelled = false;
    loadRoomQuestions(runtimeConfig.roomApiUrl, launchContext.roomCode, launchContext.playerId, launchContext.reconnectToken)
      .then((questions) => {
        if (!cancelled && questions.length > 0) setSessionQuestions(questions);
      })
      .catch((cause) => {
        if (import.meta.env.DEV) console.warn('[AIQuestion] unavailable; Retro Rush is using authoritative defaults', cause);
      });
    return () => {
      cancelled = true;
    };
  }, [launchContext]);

  useEffect(() => {
    const disposers = [
      bridge.on('snapshot', setSnapshot), bridge.on('questionOpened', (nextQuestion) => { setTargeting(null); setQuestion(nextQuestion); }),
      bridge.on('roundReset', () => { setQuestion(null); setTargeting(null); }),
      bridge.on('targetSelectionOpened', ({ protectedTargets }) => setTargeting(protectedTargets)),
      bridge.on('announcement', (message) => { setAnnouncement(message); window.setTimeout(() => setAnnouncement(''), 2400); }),
      transport.subscribe((event) => { if (event.type === 'connection') setConnection(event.status); if (event.type === 'error') setAnnouncement(localizeUserError(event.message)); }),
    ];
    void transport.connect({ roomCode, playerName });
    return () => { disposers.forEach((dispose) => dispose()); void transport.disconnect(); };
  }, [bridge, transport, roomCode, playerName]);

  useEffect(() => {
    if (!launchContext) return;
    if (!roomClient) return;
    const disposeRoom = roomClient.on('roomSnapshot', (room) => {
      if (room.currentGameSession?.gameSessionId !== launchContext.gameSessionId) return;
      setRoomIsHost(room.hostPlayerId === launchContext.playerId);
      setAuthoritativeMapSeed(room.currentGameSession.seed);
    });
    const disposeReturn = roomClient.on('returnedToGameSelection', () => {
      window.location.assign(buildPlatformGameSelectionUrl(runtimeConfig.platformUrl, roomCode, window.location.origin));
    });
    return () => {
      disposeRoom();
      disposeReturn();
    };
  }, [launchContext, roomClient, roomCode]);

  const returnToGames = () => {
    if (!launchContext) return;
    if (roomIsHost && roomClient) {
      void roomClient.returnToGameSelection()
        .catch(() => setAnnouncement('Oyunlara yalnızca mevcut oda yöneticisi dönebilir.'));
      return;
    }
    window.location.assign(buildPlatformGameSelectionUrl(runtimeConfig.platformUrl, roomCode, window.location.origin));
  };

  const toggleMute = () => { const next = !muted; setMuted(next); bridge.emit('audioMuted', { muted: next }); };
  return <main className="app-shell" data-map-seed={authoritativeMapSeed ?? undefined}>
    <GameCanvas bridge={bridge} transport={transport} questions={sessionQuestions} />
    <Hud snapshot={snapshot} muted={muted} onMute={toggleMute} onAbility={(abilityId) => bridge.emit('abilityRequested', { abilityId })} />
    {launchContext && <BackToGamesButton roomIsHost={roomIsHost} onReturn={returnToGames} />}
    {shouldShowStandaloneStart(Boolean(launchContext), snapshot.state) && <section className="start-card"><p className="eyebrow">ODA {roomCode} · {connectionStatusLabels[connection]}</p><h1>Yosunlu Ormana Gir</h1><p>Sonbahar ağaçlarının altında yarış, sisin önünde kal ve her sapmayı ekipçe düşünme fırsatına dönüştür.</p><div className="controls"><span><kbd>A</kbd><kbd>D</kbd> HAREKET</span><span><kbd>W</kbd><kbd>SPACE</kbd> ZIPLA</span><span><kbd>1</kbd>—<kbd>3</kbd> YETENEKLER</span></div><button className="button primary large" type="button" onClick={() => bridge.emit('startMatch', undefined)}>PATİKAYA BAŞLA</button></section>}
    {snapshot.state === 'COUNTDOWN' && <div className="phase-note">PARKUR BAŞLIYOR · {snapshot.countdown}</div>}
    {question && <QuestionOverlay question={question} mode="verbal" onAnswered={() => bridge.emit('questionAnswered', { questionId: question.id })} />}
    {targeting && <TargetSelection players={snapshot.players} protectedTargets={targeting} onSelect={(playerId) => { bridge.emit('targetSelected', { playerId }); setTargeting(null); }} onCancel={() => setTargeting(null)} />}
    {snapshot.state === 'FINISHED' && <ResultsScreen snapshot={snapshot} answers={[]} onRestart={() => { setQuestion(null); bridge.emit('restartMatch', undefined); }} />}
    {announcement && <div className="toast" role="status" aria-live="polite">{announcement}</div>}
  </main>;
}
