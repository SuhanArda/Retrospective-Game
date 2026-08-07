import { useEffect, useMemo, useState } from 'react';
import { GameCanvas } from '../game/GameCanvas';
import { GameEventBridge } from '../bridge/GameEventBridge';
import { MockGameTransport } from '../networking/MockGameTransport';
import { SignalRGameTransport } from '../networking/SignalRGameTransport';
import { runtimeConfig } from './runtimeConfig';
import type { ConnectionStatus, MatchSnapshot, RetroAnswer, RetroQuestion } from '../domain/types';
import { Hud } from '../ui/Hud';
import { QuestionOverlay } from '../ui/QuestionOverlay';
import { TargetSelection } from '../ui/TargetSelection';
import { ResultsScreen } from '../ui/ResultsScreen';
import { resolveGameLaunchContext } from '@retro-platform/contracts';
import { buildPlatformRoomUrl } from './runtimeConfig';

const emptySnapshot: MatchSnapshot = { state: 'LOADING', timeRemainingMs: 180_000, countdown: 3, players: [], checkpointLabel: 'Launch Pad', danger: false, cooldowns: { speed: 0, rocket: 0, ask: 0 } };

export function App() {
  const launchContext = useMemo(() => resolveGameLaunchContext(window.location.search, window.sessionStorage), []);
  const roomCode = launchContext?.roomCode ?? 'DX-204';
  const playerName = launchContext?.displayName ?? 'Local Player';
  const bridge = useMemo(() => new GameEventBridge(), []);
  const transport = useMemo(() => runtimeConfig.transportMode === 'mock' ? new MockGameTransport() : new SignalRGameTransport(runtimeConfig.hubUrl), []);
  const [snapshot, setSnapshot] = useState(emptySnapshot);
  const [question, setQuestion] = useState<RetroQuestion | null>(null);
  const [targeting, setTargeting] = useState<Readonly<Record<string, number>> | null>(null);
  const [answers, setAnswers] = useState<RetroAnswer[]>([]);
  const [announcement, setAnnouncement] = useState('');
  const [connection, setConnection] = useState<ConnectionStatus>('disconnected');
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const disposers = [
      bridge.on('snapshot', setSnapshot), bridge.on('questionOpened', setQuestion),
      bridge.on('targetSelectionOpened', ({ protectedTargets }) => setTargeting(protectedTargets)),
      bridge.on('answerCollected', (answer) => setAnswers((current) => [...current, answer])),
      bridge.on('announcement', (message) => { setAnnouncement(message); window.setTimeout(() => setAnnouncement(''), 2400); }),
      transport.subscribe((event) => { if (event.type === 'connection') setConnection(event.status); if (event.type === 'error') setAnnouncement(event.message); }),
    ];
    void transport.connect({ roomCode, playerName });
    return () => { disposers.forEach((dispose) => dispose()); void transport.disconnect(); };
  }, [bridge, transport, roomCode, playerName]);

  const toggleMute = () => { const next = !muted; setMuted(next); bridge.emit('audioMuted', { muted: next }); };
  return <main className="app-shell">
    <GameCanvas bridge={bridge} transport={transport} />
    <Hud snapshot={snapshot} muted={muted} onMute={toggleMute} onAbility={(abilityId) => bridge.emit('abilityRequested', { abilityId })} />
    {launchContext && <button className="button return-to-platform" type="button" onClick={() => window.location.assign(buildPlatformRoomUrl(runtimeConfig.platformUrl, roomCode, window.location.origin))}>Return to Lobby</button>}
    {snapshot.state === 'WAITING' && <section className="start-card"><p className="eyebrow">ROOM {roomCode} · {connection.toUpperCase()}</p><h1>Enter Mosswood</h1><p>Race beneath the autumn canopy, keep ahead of the mist, and turn every detour into a team reflection.</p><div className="controls"><span><kbd>A</kbd><kbd>D</kbd> MOVE</span><span><kbd>W</kbd><kbd>SPACE</kbd> JUMP</span><span><kbd>1</kbd>—<kbd>3</kbd> ABILITIES</span></div><button className="button primary large" type="button" onClick={() => bridge.emit('startMatch', undefined)}>Begin the trail</button></section>}
    {snapshot.state === 'COUNTDOWN' && <div className="phase-note">COURSE STARTING · {snapshot.countdown}</div>}
    {question && <QuestionOverlay question={question} onSubmit={(value, skipped) => { bridge.emit('answerSubmitted', { question, value, skipped }); setQuestion(null); }} />}
    {targeting && <TargetSelection players={snapshot.players} protectedTargets={targeting} onSelect={(playerId) => { bridge.emit('targetSelected', { playerId }); setTargeting(null); }} onCancel={() => setTargeting(null)} />}
    {snapshot.state === 'FINISHED' && <ResultsScreen snapshot={snapshot} answers={answers} onRestart={() => { setAnswers([]); setQuestion(null); bridge.emit('restartMatch', undefined); }} />}
    {announcement && <div className="toast" role="status" aria-live="polite">{announcement}</div>}
  </main>;
}
