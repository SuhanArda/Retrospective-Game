import { useEffect, useMemo, useRef, useState } from 'react';
import { RoomRealtimeClient } from '@retro-platform/realtime-client';
import type { RoomPlayerSnapshot } from '@retro-platform/contracts';
import { DrawingCanvas, type DrawingCanvasHandle } from '../components/DrawingCanvas';
import { PlayerList } from '../components/PlayerList';
import { GuessChat, type ChatMessage } from '../components/GuessChat';
import { ScoreBoard } from '../components/ScoreBoard';
import { ScorePop } from '../components/ScorePop';
import { RoundTimer } from '../components/RoundTimer';
import { WordHint } from '../components/WordHint';
import { pickRandomWord } from '../data/words';
import { MOCK_PLAYERS, pickRandomDrawer } from '../data/mockPlayers';
import type { DisplayPlayer } from '../domain/displayPlayer';
import { DrawAndGuessRoomBridge, type DrawAndGuessBridgeState } from './roomBridge';
import {
  buildPlatformGameSelectionUrl,
  drawAndGuessRuntimeConfig,
  resolveDrawAndGuessLaunchContext,
} from './platformIntegration';
import '../styles/App.css';

const RECENT_WORD_MEMORY = 8;
const YOU_ID = 'you';
const BOT_MIN_DELAY_MS = 1500;
const BOT_MAX_DELAY_MS = 5000;
const BOT_CORRECT_CHANCE = 0.55;
/** How long the room connection gets before the game opens standalone — mirrors rus-ruleti. */
const ROOM_DEADLINE_MS = 5_000;

/** 1., 2., 3. bilen bu kadar puan alır; sonrakiler sabit 3 puanla yetinir. Sunucudaki DrawAndGuessRankPoints ile aynı. */
const GUESS_RANK_POINTS = [10, 7, 5];
const GUESS_FALLBACK_POINTS = 3;
/** Çizen kişi, o turu doğru bilen herkes için bu kadar puan kazanır. */
const DRAWER_POINTS_PER_CORRECT_GUESSER = 2;

function normalize(text: string) {
  return text.trim().toLocaleLowerCase('tr');
}

/**
 * Oda bağlamı varsa (platformdan gerçek bir oda üzerinden açıldıysa) gerçek
 * oyuncularla, sunucu üzerinden senkronize oynanır. Yoksa (bağımsız test)
 * sahte oyuncular ve yerel botlarla eski standalone davranış aynen çalışır.
 */
export function App() {
  const launchContext = useMemo(
    () => resolveDrawAndGuessLaunchContext(window.location.search, window.sessionStorage, window),
    [],
  );
  return launchContext ? <OnlineGame launchContext={launchContext} /> : <StandaloneGame />;
}

interface OnlineGameProps {
  launchContext: NonNullable<ReturnType<typeof resolveDrawAndGuessLaunchContext>>;
}

function OnlineGame({ launchContext }: OnlineGameProps) {
  const [roster, setRoster] = useState<readonly RoomPlayerSnapshot[] | null>(null);
  const [roomIsHost, setRoomIsHost] = useState(launchContext.isHost);
  const [roomSettled, setRoomSettled] = useState(false);
  const [bridgeState, setBridgeState] = useState<DrawAndGuessBridgeState | null>(null);
  const [word, setWord] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [announcement, setAnnouncement] = useState('');
  const [scorePop, setScorePop] = useState<{ id: string; points: number } | null>(null);
  const bridgeRef = useRef<DrawAndGuessRoomBridge | null>(null);
  const roomClientRef = useRef<RoomRealtimeClient | null>(null);
  const canvasRef = useRef<DrawingCanvasHandle | null>(null);
  const nextMessageIdRef = useRef(0);

  const localPlayerId = launchContext.playerId;

  useEffect(() => {
    let settled = false;
    const settle = () => { if (settled) return; settled = true; setRoomSettled(true); };
    const deadline = window.setTimeout(settle, ROOM_DEADLINE_MS);

    const client = RoomRealtimeClient.fromLaunchContext(drawAndGuessRuntimeConfig.apiUrl, launchContext);
    roomClientRef.current = client;
    const bridge = new DrawAndGuessRoomBridge(client, launchContext.gameSessionId);
    bridgeRef.current = bridge;

    const disposers = [
      client.on('roomSnapshot', (room) => {
        setRoster(room.players);
        setRoomIsHost(room.hostPlayerId === launchContext.playerId);
      }),
      client.on('returnedToGameSelection', () => {
        window.location.assign(
          buildPlatformGameSelectionUrl(drawAndGuessRuntimeConfig.platformUrl, launchContext.roomCode, window.location.origin),
        );
      }),
      bridge.onStateChanged((state) => setBridgeState(state)),
      bridge.onGuess((event) => {
        const messageId = `online-guess-${nextMessageIdRef.current++}`;
        setMessages((msgs) => [
          ...msgs,
          event.correct
            ? { id: messageId, playerId: event.playerId, playerName: event.displayName, kind: 'correct', correctRank: event.rank }
            : { id: messageId, playerId: event.playerId, playerName: event.displayName, kind: 'guess', text: event.text },
        ]);
        if (event.correct && event.playerId === localPlayerId && event.points !== undefined) {
          setScorePop({ id: crypto.randomUUID(), points: event.points });
        }
      }),
      bridge.onStroke((event) => {
        const [x, y] = event.points;
        if (x === undefined || y === undefined) return;
        canvasRef.current?.applyRemotePoint(x, y, event.newStroke, event.color, event.isEraser);
      }),
      bridge.onCanvasCleared(() => canvasRef.current?.clearRemote()),
      bridge.onWordReveal((revealedWord) => {
        setMessages((msgs) => [...msgs, { id: crypto.randomUUID(), playerId: '', playerName: '', kind: 'reveal', text: revealedWord }]);
      }),
    ];

    void client.connect().then(
      () => { window.clearTimeout(deadline); settle(); setAnnouncement(''); },
      (error: unknown) => {
        // A cancelled connect is this effect tearing down its own client —
        // React re-runs effects once on mount in development.
        if (error instanceof Error && error.message === 'ROOM_CONNECTION_CANCELLED') return;
        window.clearTimeout(deadline);
        settle();
        setAnnouncement('Oda bağlantısı kurulamadı');
      },
    );

    return () => {
      window.clearTimeout(deadline);
      disposers.forEach((dispose) => dispose());
      bridge.dispose();
      bridgeRef.current = null;
      roomClientRef.current = null;
      void client.disconnect();
    };
  }, [launchContext]);

  // Yeni tur başladığında (roundNumber değişince) çizen kişi kelimeyi ister.
  // Diğer herkes için sunucu bu isteği zaten reddeder (NOT_DRAWER).
  const isYouDrawing = bridgeState?.drawerId === localPlayerId;
  useEffect(() => {
    if (!isYouDrawing || !bridgeRef.current) { setWord(null); return; }
    let cancelled = false;
    void bridgeRef.current.requestWord().then((value) => { if (!cancelled) setWord(value); }).catch(() => undefined);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isYouDrawing, bridgeState?.roundNumber]);

  const displayPlayers: DisplayPlayer[] = useMemo(
    () => (roster ?? []).map((player) => ({
      id: player.id,
      name: player.displayName,
      color: player.color,
      isYou: player.id === localPlayerId,
    })),
    [roster, localPlayerId],
  );

  const drawerName = displayPlayers.find((player) => player.id === bridgeState?.drawerId)?.name ?? '';
  const youAlreadyCorrect = Boolean(bridgeState?.correctGuesserIds.includes(localPlayerId));
  const scores = bridgeState?.scores ?? {};

  function handleGuessSubmit(text: string) {
    void bridgeRef.current?.submitGuess(text).then(
      (result) => console.log('[DrawAndGuess] Guess submit result:', result),
      (error: unknown) => console.error('[DrawAndGuess] Guess submit failed:', error),
    );
  }

  function handleStroke(x: number, y: number, newStroke: boolean, color: string, isEraser: boolean) {
    bridgeRef.current?.sendStroke([x, y], newStroke, color, isEraser);
  }

  function handleClear() {
    bridgeRef.current?.clearCanvas();
  }

  function handleNextRound() {
    bridgeRef.current?.nextRound();
  }

  function handleRequestLetterHint() {
    bridgeRef.current?.requestLetterHint();
  }

  function returnToGames() {
    void roomClientRef.current?.returnToGameSelection().catch(() => setAnnouncement('Oda bağlantısı kurulamadı'));
  }

  if (!roomSettled) {
    return (
      <div className="page">
        <div className="page-content">
          <div className="brand">Draw & Guess</div>
          <p className="word-panel-hidden">Odaya bağlanılıyor…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      {scorePop && <ScorePop key={scorePop.id} points={scorePop.points} onDone={() => setScorePop(null)} />}
      <div className="page-content">
        <div className="brand">Draw & Guess</div>
        <h1 className="title">Çiz, tahmin et</h1>

        {roster === null ? (
          <p className="word-panel-hidden">Oyuncular yükleniyor…</p>
        ) : (
          <>
            <PlayerList players={displayPlayers} drawerId={bridgeState?.drawerId ?? ''} />

            <div className="word-panel">
              {bridgeState && <RoundTimer endsAtUtc={bridgeState.roundEndsAtUtc} />}
              {isYouDrawing ? (
                <>
                  <span className="word-panel-label">Çizilecek kelime</span>
                  <span className="word-panel-word">{word ?? '…'}</span>
                  {bridgeState && (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={handleRequestLetterHint}
                      disabled={Object.keys(bridgeState.revealedLetters).length >= bridgeState.wordLength}
                    >
                      Harf Ver
                    </button>
                  )}
                </>
              ) : (
                <>
                  <span className="word-panel-hidden">{drawerName} çiziyor — tahmin etmeye çalış</span>
                  {bridgeState && (
                    <WordHint wordLength={bridgeState.wordLength} revealedLetters={bridgeState.revealedLetters} />
                  )}
                </>
              )}
              {roomIsHost && (
                <button type="button" className="btn-secondary" onClick={handleNextRound}>
                  Sıradaki tur
                </button>
              )}
            </div>

            <div className="game-area">
              <DrawingCanvas ref={canvasRef} canDraw={isYouDrawing} onStroke={handleStroke} onClear={handleClear} />
              <div className="game-area-side">
                <GuessChat
                  messages={messages}
                  canGuess={!isYouDrawing && !youAlreadyCorrect}
                  alreadyCorrect={youAlreadyCorrect}
                  onSubmit={handleGuessSubmit}
                />
                <ScoreBoard players={displayPlayers} scores={scores} />
              </div>
            </div>

            {roomIsHost && (
              <button type="button" className="clear-button" onClick={returnToGames}>
                Oyunlara Dön
              </button>
            )}
          </>
        )}

        {announcement && <p className="word-panel-hidden" role="status">{announcement}</p>}
      </div>
    </div>
  );
}

/**
 * Oda bağlamı yokken (bağımsız test) çalışan eski davranış — sahte
 * oyuncular (Sen, Ada, Mert, Ece) ve yerel botlarla tek başına test
 * edilebilir bir prototip.
 */
function StandaloneGame() {
  const [word, setWord] = useState(() => pickRandomWord());
  const [recentWords, setRecentWords] = useState<string[]>([word]);
  const [drawerId, setDrawerId] = useState(() => pickRandomDrawer(MOCK_PLAYERS).id);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [correctGuesserIds, setCorrectGuesserIds] = useState<string[]>([]);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [scorePop, setScorePop] = useState<{ id: string; points: number } | null>(null);

  const isYouDrawing = drawerId === YOU_ID;
  const youAlreadyCorrect = correctGuesserIds.includes(YOU_ID);
  const drawerName = MOCK_PLAYERS.find((player) => player.id === drawerId)?.name ?? '';

  // State setter'ları setState updater'ının içinden zincirlemek yerine
  // (StrictMode'da updater'lar iki kez çalışır, mesajlar ikiye katlanırdı)
  // "kim doğru bildi" listesini bir ref'te de tutup senkron okuyoruz.
  const correctGuesserIdsRef = useRef<string[]>([]);

  function submitGuess(playerId: string, playerName: string, rawText: string) {
    if (correctGuesserIdsRef.current.includes(playerId)) return; // zaten bildi
    const isCorrect = normalize(rawText) === normalize(word);
    if (isCorrect) {
      const rank = correctGuesserIdsRef.current.length + 1;
      correctGuesserIdsRef.current = [...correctGuesserIdsRef.current, playerId];
      setCorrectGuesserIds(correctGuesserIdsRef.current);
      setMessages((msgs) => [...msgs, { id: crypto.randomUUID(), playerId, playerName, kind: 'correct', correctRank: rank }]);
      const points = GUESS_RANK_POINTS[rank - 1] ?? GUESS_FALLBACK_POINTS;
      setScores((current) => ({ ...current, [playerId]: (current[playerId] ?? 0) + points }));
      if (playerId === YOU_ID) setScorePop({ id: crypto.randomUUID(), points });
    } else {
      setMessages((msgs) => [...msgs, { id: crypto.randomUUID(), playerId, playerName, kind: 'guess', text: rawText }]);
    }
  }

  // Her yeni tur botların zamanlayıcılarını sıfırlıyor; tur değişmeden önce
  // kurulmuş bir setTimeout yeni tura mesaj atmasın diye temizleniyor.
  const roundKey = `${drawerId}:${word}`;
  const roundKeyRef = useRef(roundKey);
  roundKeyRef.current = roundKey;

  useEffect(() => {
    setMessages([]);
    correctGuesserIdsRef.current = [];
    setCorrectGuesserIds([]);

    const guessers = MOCK_PLAYERS.filter((player) => player.id !== drawerId && player.id !== YOU_ID);
    const timers = guessers.map((bot) => {
      const delay = BOT_MIN_DELAY_MS + Math.random() * (BOT_MAX_DELAY_MS - BOT_MIN_DELAY_MS);
      return window.setTimeout(() => {
        if (roundKeyRef.current !== roundKey) return; // tur bu arada değişmiş
        const guessesCorrectly = Math.random() < BOT_CORRECT_CHANCE;
        const text = guessesCorrectly ? word : pickRandomWord([word]);
        submitGuess(bot.id, bot.name, text);
      }, delay);
    });

    return () => timers.forEach((timer) => window.clearTimeout(timer));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundKey]);

  function handleNextTurn() {
    // Tur biterken çizen, o turu doğru bilen herkes için bonus alır — kimse
    // bilemediyse çizen de puansız kalır, iyi çizmeye teşvik eder.
    const correctCount = correctGuesserIdsRef.current.length;
    if (correctCount > 0) {
      const bonus = correctCount * DRAWER_POINTS_PER_CORRECT_GUESSER;
      setScores((current) => ({ ...current, [drawerId]: (current[drawerId] ?? 0) + bonus }));
    }

    const nextWord = pickRandomWord(recentWords);
    setWord(nextWord);
    setRecentWords((current) => [nextWord, ...current].slice(0, RECENT_WORD_MEMORY));
    setDrawerId((current) => pickRandomDrawer(MOCK_PLAYERS, current).id);
  }

  return (
    <div className="page">
      {scorePop && <ScorePop key={scorePop.id} points={scorePop.points} onDone={() => setScorePop(null)} />}
      <div className="page-content">
        <div className="brand">Draw & Guess</div>
        <h1 className="title">Çiz, tahmin et</h1>

        <PlayerList players={MOCK_PLAYERS} drawerId={drawerId} />

        <div className="word-panel">
          {isYouDrawing ? (
            <>
              <span className="word-panel-label">Çizilecek kelime</span>
              <span className="word-panel-word">{word}</span>
            </>
          ) : (
            <span className="word-panel-hidden">{drawerName} çiziyor — tahmin etmeye çalış</span>
          )}
          <button type="button" className="btn-secondary" onClick={handleNextTurn}>
            Sıradaki tur
          </button>
        </div>

        <div className="game-area">
          <DrawingCanvas canDraw={isYouDrawing} />
          <div className="game-area-side">
            <GuessChat
              messages={messages}
              canGuess={!isYouDrawing && !youAlreadyCorrect}
              alreadyCorrect={youAlreadyCorrect}
              onSubmit={(text) => submitGuess(YOU_ID, 'Sen', text)}
            />
            <ScoreBoard players={MOCK_PLAYERS} scores={scores} />
          </div>
        </div>
      </div>
    </div>
  );
}
