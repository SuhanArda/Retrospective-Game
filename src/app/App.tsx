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

const emptySnapshot: MatchSnapshot = { state: 'LOADING', timeRemainingMs: 180_000, countdown: 3, players: [], checkpointLabel: 'Launch Pad', danger: false, cooldowns: { speed: 0, rocket: 0, ask: 0 } };

export function App() {
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
    void transport.connect({ roomCode: 'DX-204', playerName: 'Local Player' });
    return () => { disposers.forEach((dispose) => dispose()); void transport.disconnect(); };
  }, [bridge, transport]);

  const toggleMute = () => { const next = !muted; setMuted(next); bridge.emit('audioMuted', { muted: next }); };
  return <main className="app-shell">
    <GameCanvas bridge={bridge} transport={transport} />
    <Hud snapshot={snapshot} muted={muted} onMute={toggleMute} onAbility={(abilityId) => bridge.emit('abilityRequested', { abilityId })} />
    {snapshot.state === 'WAITING' && <section className="start-card"><p className="eyebrow">ROOM DX-204 · {connection.toUpperCase()}</p><h1>Ready for Retro Rush?</h1><p>Run together, dodge the camera edge, and turn every detour into a team reflection.</p><div className="controls"><span><kbd>A</kbd><kbd>D</kbd> MOVE</span><span><kbd>W</kbd><kbd>SPACE</kbd> JUMP</span><span><kbd>1</kbd>—<kbd>3</kbd> ABILITIES</span></div><button className="button primary large" type="button" onClick={() => bridge.emit('startMatch', undefined)}>Start the run</button></section>}
    {snapshot.state === 'COUNTDOWN' && <div className="phase-note">COURSE STARTING · {snapshot.countdown}</div>}
    {question && <QuestionOverlay question={question} onSubmit={(value, skipped) => { bridge.emit('answerSubmitted', { question, value, skipped }); setQuestion(null); }} />}
    {targeting && <TargetSelection players={snapshot.players} protectedTargets={targeting} onSelect={(playerId) => { bridge.emit('targetSelected', { playerId }); setTargeting(null); }} onCancel={() => setTargeting(null)} />}
    {snapshot.state === 'FINISHED' && <ResultsScreen snapshot={snapshot} answers={answers} onRestart={() => { setAnswers([]); setQuestion(null); bridge.emit('restartMatch', undefined); }} />}
    {announcement && <div className="toast" role="status" aria-live="polite">{announcement}</div>}
  </main>;
}
