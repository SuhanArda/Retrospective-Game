import { useEffect, useMemo, useState } from 'react';
import type { GeneratedQuestion, TankBattleGameSnapshot } from '@retro-platform/contracts';
import { consumeGameHandoff, resolveGameLaunchContext } from '@retro-platform/contracts';
import { RoomQuestionProvider, RoomRealtimeClient } from '@retro-platform/realtime-client';
import { GameEventBridge } from '../bridge/GameEventBridge';
import { GameCanvas } from '../game/GameCanvas';
import { MockGameTransport } from '../networking/MockGameTransport';
import { SignalRGameTransport } from '../networking/SignalRGameTransport';
import { Hud } from '../ui/Hud';
import { QuestionOverlay } from '../ui/QuestionOverlay';
import { ResultsPanel } from '../ui/ResultsPanel';
import { buildPlatformGameSelectionUrl, runtimeConfig } from './runtimeConfig';
import { canShowBackToGames } from './roomControls';
import { bindTankBattleRoomLifecycle } from './roomLifecycle';

const fallbackQuestions = [
  'Bu sprintte takım olarak en güçlü olduğunuz an neydi?',
  'Bir sonraki sprintte birlikte hangi davranışı değiştirmek istersiniz?',
  'Bu maçtaki gibi işte de sizi zorlayan en büyük engel neydi?',
  'Takım arkadaşınızdan öğrendiğiniz en değerli şey ne oldu?',
  'Bir sonraki sprint için tek bir iyileştirme seçseniz bu ne olurdu?',
];

export function App() {
  const launchContext = useMemo(() => consumeGameHandoff(window, window.sessionStorage)
    ?? resolveGameLaunchContext(window.location.search, window.sessionStorage), []);
  const bridge = useMemo(() => new GameEventBridge(), []);
  const roomClient = useMemo(() => launchContext
    ? RoomRealtimeClient.fromLaunchContext(runtimeConfig.roomApiUrl, launchContext) : null, [launchContext]);
  const transport = useMemo(() => roomClient && launchContext
    ? new SignalRGameTransport(roomClient, launchContext) : new MockGameTransport(), [launchContext, roomClient]);
  const [snapshot, setSnapshot] = useState<TankBattleGameSnapshot | null>(null);
  const [aim, setAim] = useState({ angle: 42, power: 340 });
  const [connection, setConnection] = useState('bağlanıyor');
  const [announcement, setAnnouncement] = useState('');
  const [questions, setQuestions] = useState<readonly GeneratedQuestion[]>([]);
  const [roomIsHost, setRoomIsHost] = useState(false);

  useEffect(() => {
    if (!roomClient || !launchContext) return;
    return bindTankBattleRoomLifecycle({
      onRoomSnapshot: (listener) => roomClient.on('roomSnapshot', listener),
      onReturnedToGameSelection: (listener) => roomClient.on('returnedToGameSelection', listener),
    }, {
      localPlayerId: launchContext.playerId,
      onHostChanged: setRoomIsHost,
      onReturnedToGameSelection: () => {
        window.location.assign(buildPlatformGameSelectionUrl(
          runtimeConfig.platformUrl,
          launchContext.roomCode,
          window.location.origin,
        ));
      },
    });
  }, [launchContext, roomClient]);

  useEffect(() => {
    const disposers = [
      bridge.on('snapshot', setSnapshot),
      bridge.on('aimChanged', setAim),
      bridge.on('announcement', (message) => {
        setAnnouncement(localizeError(message));
        window.setTimeout(() => setAnnouncement(''), 2600);
      }),
      transport.subscribe((event) => {
        if (event.type === 'connection') setConnection(event.status === 'connected' ? 'çevrimiçi' : event.status);
      }),
    ];
    void transport.connect();
    return () => { disposers.forEach((dispose) => dispose()); void transport.disconnect(); };
  }, [bridge, transport]);

  useEffect(() => {
    if (!launchContext) return;
    let cancelled = false;
    new RoomQuestionProvider(runtimeConfig.roomApiUrl)
      .getForRoom(launchContext.roomCode, launchContext.playerId, launchContext.reconnectToken)
      .then((set) => { if (!cancelled) setQuestions(set.questions); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [launchContext]);

  const localTank = snapshot?.players.find((player) => player.playerId === transport.localPlayerId);
  const activeQuestion = snapshot?.activeQuestion;
  const losingPlayers = activeQuestion
    ? snapshot?.players.filter((player) => player.team === activeQuestion.loserTeam && player.connected) ?? []
    : [];
  const hasConfirmedQuestion = Boolean(activeQuestion?.answeredPlayerIds.includes(transport.localPlayerId));
  const canConfirmQuestion = Boolean(activeQuestion && localTank?.team === activeQuestion.loserTeam && !hasConfirmedQuestion);
  const connectedAnswerCount = activeQuestion
    ? losingPlayers.filter((player) => activeQuestion.answeredPlayerIds.includes(player.playerId)).length
    : 0;
  const questionPrompt = activeQuestion
    ? questions[activeQuestion.questionIndex % Math.max(questions.length, 1)]?.text
      ?? fallbackQuestions[activeQuestion.questionIndex % fallbackQuestions.length]
      ?? fallbackQuestions[0]!
    : '';

  const returnToGames = () => {
    if (!launchContext || !roomIsHost || !roomClient) return;
    void roomClient.returnToGameSelection()
      .catch((error: unknown) => {
        console.error('[TankBattle] Return to game selection failed', error);
        setAnnouncement('Oyunlara yalnızca oda yöneticisi dönebilir.');
      });
  };

  return <main className="app-shell">
    <GameCanvas bridge={bridge} transport={transport} />
    <Hud snapshot={snapshot} localPlayerId={transport.localPlayerId} angle={aim.angle} power={aim.power} connection={connection} />
    <aside className="controls" aria-label="Kontroller"><span><kbd>A</kbd><kbd>D</kbd> DÖN + HAREKET</span><span><b>↕</b> FAREYLE YUKARI/AŞAĞI NİŞAN</span><span><b>●</b> SOL TIK ATEŞ</span></aside>
    {canShowBackToGames(Boolean(launchContext), roomIsHost) && <button className="back-button" type="button" data-game-ui-interactive="true" onClick={returnToGames}><span>←</span> OYUNLARA DÖN <small>HOST</small></button>}
    {!launchContext && <div className="demo-badge">YEREL ANTRENMAN</div>}
    {snapshot?.result && <ResultsPanel snapshot={snapshot} />}
    {activeQuestion && <QuestionOverlay
      prompt={questionPrompt}
      canConfirm={canConfirmQuestion}
      hasConfirmed={hasConfirmedQuestion}
      answeredCount={connectedAnswerCount}
      requiredCount={losingPlayers.length}
      onComplete={() => transport.completeQuestion(activeQuestion.questionId)}
    />}
    {announcement && <div className="toast" role="status" aria-live="polite">{announcement}</div>}
  </main>;
}

function localizeError(message: string): string {
  const labels: Record<string, string> = {
    TANK_FIRE_COOLDOWN: 'Top yeniden doluyor.',
    TANK_ELIMINATED: 'Elenen tank hareket edemez.',
    TANK_BATTLE_NOT_RUNNING: 'Maç tamamlandı.',
    WRONG_GAME_SESSION: 'Bu oda artık Tank Battle oynamıyor.',
  };
  return labels[message] ?? message;
}
