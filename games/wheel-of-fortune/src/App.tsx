import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { RoomRealtimeClient } from '@retro-platform/realtime-client';
import type { RoomSnapshot, WheelOfFortuneStateSnapshot } from '@retro-platform/contracts';
import { Wheel } from './Wheel';
import { buildGameSelectionUrl, resolveLaunchContext, runtimeConfig } from './platformIntegration';
import { ServerClock } from './serverClock';

const launchContext = resolveLaunchContext(window.location.search, window.sessionStorage, window);

export function App() {
  if (!launchContext) return <Fatal message="Geçerli bir oyun oturumu bulunamadı." />;
  return <OnlineGame />;
}

function OnlineGame() {
  const context = launchContext!;
  const clientRef = useRef<RoomRealtimeClient | null>(null);
  const clockRef = useRef(new ServerClock());
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [game, setGame] = useState<WheelOfFortuneStateSnapshot | null>(null);
  const [connection, setConnection] = useState<'connecting' | 'connected' | 'reconnecting' | 'disconnected'>('connecting');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let disposed = false;
    const client = RoomRealtimeClient.fromLaunchContext(runtimeConfig.apiUrl, context);
    clientRef.current = client;
    const applyGame = (next?: WheelOfFortuneStateSnapshot) => {
      if (!next || next.gameSessionId !== context.gameSessionId) return;
      clockRef.current.observe(next.serverTimeUnixMs);
      setGame((current) => !current || next.revision >= current.revision ? next : current);
    };
    const offRoom = client.on('roomSnapshot', (next) => {
      setRoom(next);
      applyGame(next.wheelOfFortuneState);
    });
    const offGame = client.on('wheelOfFortuneStateChanged', applyGame);
    const offConnection = client.on('connectionChanged', setConnection);
    const offReturn = client.on('returnedToGameSelection', () => {
      window.location.assign(buildGameSelectionUrl(runtimeConfig.platformUrl, context.roomCode, window.location.origin));
    });
    void client.connect().then((snapshot) => {
      if (disposed) return;
      setRoom(snapshot);
      applyGame(snapshot.wheelOfFortuneState);
    }).catch(() => !disposed && setError('Oda bağlantısı kurulamadı.'));
    return () => {
      disposed = true;
      offRoom(); offGame(); offConnection(); offReturn();
      clientRef.current = null;
      void client.disconnect();
    };
  }, [context]);

  const isHost = room?.hostPlayerId === context.playerId;
  const playerItems = useMemo(() => (room?.players ?? [])
    .filter((player) => player.isConnected || player.id === game?.selectedPlayerId)
    .map((player) => ({ id: player.id, label: player.displayName })), [room?.players, game?.selectedPlayerId]);
  const questionItems = useMemo(() => (game?.questions ?? []).map((question, index) => ({
    id: question.id, label: `SORU ${index + 1}`,
  })), [game?.questions]);
  const selectedPlayer = room?.players.find((player) => player.id === game?.selectedPlayerId);
  const selectedQuestion = game?.questions.find((question) => question.id === game?.selectedQuestionId);
  const selectedQuestionNumber = game?.questions.findIndex((question) => question.id === game.selectedQuestionId) ?? -1;

  async function act(action: (client: RoomRealtimeClient) => Promise<WheelOfFortuneStateSnapshot>) {
    const client = clientRef.current;
    if (!client || busy) return false;
    setBusy(true); setError('');
    try { setGame(await action(client)); return true; }
    catch (cause: unknown) { setError(readableError(cause)); return false; }
    finally { setBusy(false); }
  }

  function addQuestion(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    void act((client) => client.addWheelQuestion({ gameSessionId: context.gameSessionId, text }))
      .then((added) => { if (added) setDraft(''); });
  }

  if (error && !game) return <Fatal message={error} />;
  if (!room || !game) return <Loading connection={connection} />;

  if (game.phase === 'SETUP') {
    return (
      <Shell roomCode={room.code} connection={connection} isHost={isHost} onReturn={() => void clientRef.current?.returnToGameSelection()}>
        {isHost ? (
          <main className="setup-card pixel-panel">
            <p className="eyebrow">SUNUCU KURULUMU</p>
            <h1>SORULARINI HAZIRLA</h1>
            <p className="muted">Takımın için sorularını yaz. Oyun boyunca yalnızca bu liste kullanılacak.</p>
            <form className="question-form" onSubmit={addQuestion}>
              <label className="sr-only" htmlFor="new-question">Bir soru yaz</label>
              <input id="new-question" value={draft} maxLength={300} onChange={(event) => setDraft(event.target.value)} placeholder="Bir soru yaz..." />
              <button className="pixel-button secondary" disabled={busy || !draft.trim()}>+ EKLE</button>
            </form>
            <ol className="question-list">
              {game.questions.map((question) => (
                <li key={question.id}>
                  <input
                    aria-label="Soruyu düzenle"
                    defaultValue={question.text}
                    maxLength={300}
                    onBlur={(event) => {
                      const text = event.target.value.trim();
                      if (text && text !== question.text) void act((client) => client.updateWheelQuestion({ gameSessionId: context.gameSessionId, questionId: question.id, text }));
                      else event.target.value = question.text;
                    }}
                  />
                  <button className="delete-button" aria-label={`${question.text} sorusunu sil`} disabled={busy}
                    onClick={() => void act((client) => client.removeWheelQuestion(context.gameSessionId, question.id))}>SİL</button>
                </li>
              ))}
            </ol>
            {game.questions.length === 0 && <p className="empty-state">İlk sorunu ekleyerek çarkı hazırla.</p>}
            {error && <p className="error" role="alert">{error}</p>}
            <button className="pixel-button primary start-button" disabled={busy || game.questions.length === 0}
              onClick={() => void act((client) => client.startWheelGame({ gameSessionId: context.gameSessionId }))}>OYUNU BAŞLAT</button>
          </main>
        ) : (
          <main className="waiting-card pixel-panel">
            <div className="hourglass" aria-hidden="true">⌛</div>
            <p className="eyebrow">HAZIRLIK AŞAMASI</p>
            <h1>HOST SORULARI HAZIRLIYOR...</h1>
            <p className="question-count">{game.questions.length} SORU HAZIR</p>
          </main>
        )}
      </Shell>
    );
  }

  const playerSpinning = game.phase === 'PLAYER_WHEEL_SPINNING';
  const questionEnabled = ['QUESTION_WHEEL_READY', 'QUESTION_WHEEL_SPINNING', 'QUESTION_REVEAL'].includes(game.phase);
  const questionSpinning = game.phase === 'QUESTION_WHEEL_SPINNING';
  const remaining = game.questions.length - game.usedQuestionIds.length;

  return (
    <Shell roomCode={room.code} connection={connection} isHost={isHost} onReturn={() => void clientRef.current?.returnToGameSelection()}>
      <main className="game-board">
        <div className="score-strip pixel-panel">
          <span>TUR <b>{String(game.roundNumber).padStart(2, '0')}</b></span>
          <span>KALAN SORU <b>{remaining}/{game.questions.length}</b></span>
        </div>
        <div className="wheels-grid">
          <section className="wheel-card pixel-panel">
            <span className="step-badge">1</span><p className="eyebrow">OYUNCU ÇARKI</p><h2>KİM CEVAPLAYACAK?</h2>
            <Wheel items={playerItems} spin={game.playerSpin} selectedId={game.selectedPlayerId} ariaLabel="Oyuncu çarkı" now={() => clockRef.current.now()} />
            {isHost ? <button className="pixel-button primary" disabled={busy || game.phase !== 'PLAYER_WHEEL_READY'}
              onClick={() => void act((client) => client.spinWheelPlayer({ gameSessionId: context.gameSessionId }))}>
              {playerSpinning ? 'ÇARK DÖNÜYOR...' : 'OYUNCU ÇARKINI ÇEVİR'}
            </button> : <p className="control-hint">{playerSpinning ? 'ÇARK DÖNÜYOR...' : 'HOST ÇARKI ÇEVİRECEK'}</p>}
            {game.selectedPlayerId && !playerSpinning && <div className="mini-result"><small>SEÇİLEN OYUNCU</small><strong>{selectedPlayer?.displayName ?? 'Oyuncu'}</strong></div>}
          </section>
          <section className={`wheel-card pixel-panel ${questionEnabled ? '' : 'locked-card'}`}>
            <span className="step-badge">2</span><p className="eyebrow">SORU ÇARKI</p><h2>HANGİ SORU?</h2>
            <Wheel items={questionItems} spin={game.questionSpin} selectedId={game.selectedQuestionId} inactive={!questionEnabled} ariaLabel="Soru çarkı" now={() => clockRef.current.now()} />
            <div className="question-legend" aria-label="Soru çarkı açıklamaları">
              <p>SORU LİSTESİ</p>
              <ol>
                {game.questions.map((question, index) => (
                  <li className={game.phase === 'QUESTION_REVEAL' && question.id === game.selectedQuestionId ? 'is-selected' : ''} key={question.id}>
                    <b>SORU {index + 1}</b><span>{question.text}</span>
                  </li>
                ))}
              </ol>
            </div>
            {isHost ? <button className="pixel-button accent" disabled={busy || game.phase !== 'QUESTION_WHEEL_READY'}
              onClick={() => void act((client) => client.spinWheelQuestion({ gameSessionId: context.gameSessionId }))}>
              {questionSpinning ? 'ÇARK DÖNÜYOR...' : 'SORU ÇARKINI ÇEVİR'}
            </button> : <p className="control-hint">{questionEnabled ? (questionSpinning ? 'ÇARK DÖNÜYOR...' : 'HOST ÇARKI ÇEVİRECEK') : 'ÖNCE OYUNCU SEÇİLECEK'}</p>}
          </section>
        </div>
        {game.phase === 'QUESTION_REVEAL' && (
          <section className="reveal-panel pixel-panel" aria-live="polite">
            <div><small>SEÇİLEN OYUNCU</small><strong>{selectedPlayer?.displayName ?? 'Oyuncu'}</strong></div>
            <div className="question-reveal"><small>SEÇİLEN SORU</small><strong>SORU {selectedQuestionNumber + 1}</strong><blockquote>“{selectedQuestion?.text}”</blockquote></div>
            <p>SIRA SENDE!</p>
            {isHost && <button className="pixel-button primary" disabled={busy}
              onClick={() => void act((client) => client.nextWheelRound({ gameSessionId: context.gameSessionId }))}>SONRAKİ TUR →</button>}
          </section>
        )}
        {error && <p className="error floating-error" role="alert">{error}</p>}
      </main>
    </Shell>
  );
}

function Shell({ children, roomCode, connection, isHost, onReturn }: {
  children: ReactNode; roomCode: string; connection: string; isHost: boolean; onReturn: () => void;
}) {
  return <div className="app-shell">
    <header><div className="logo-mark"><span>★</span><div><small>RETRO ARCADE</small><b>ÇARKI FELEK</b></div></div>
      <div className="header-meta"><span className={`connection ${connection}`}>{connection === 'connected' ? 'BAĞLI' : 'BAĞLANIYOR'}</span><span>ODA {roomCode}</span>
        {isHost && <button className="back-button" onClick={onReturn}>← OYUNLARA DÖN</button>}</div></header>
    {children}<footer>HER TUR BİR SES • HER SORU BİR ADIM</footer>
  </div>;
}

function Loading({ connection }: { connection: string }) {
  return <div className="center-screen"><div className="loader" /><h1>ÇARKLAR HAZIRLANIYOR</h1><p>{connection}</p></div>;
}

function Fatal({ message }: { message: string }) {
  return <div className="center-screen"><h1>ÇARKI FELEK</h1><p className="error" role="alert">{message}</p></div>;
}

function readableError(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('HOST_REQUIRED')) return 'Bu işlemi yalnızca oda kurucusu yapabilir.';
  if (message.includes('INVALID_QUESTION')) return 'Soru boş olamaz ve 300 karakteri geçemez.';
  if (message.includes('INVALID_WHEEL_PHASE')) return 'Bu işlem şu anda yapılamaz. Güncel tur durumu bekleniyor.';
  return 'İşlem tamamlanamadı. Bağlantını kontrol edip tekrar dene.';
}
