import { useEffect, useRef, useState } from 'react';
import { DrawingCanvas } from '../components/DrawingCanvas';
import { PlayerList } from '../components/PlayerList';
import { GuessChat, type ChatMessage } from '../components/GuessChat';
import { ScoreBoard } from '../components/ScoreBoard';
import { pickRandomWord } from '../data/words';
import { MOCK_PLAYERS, pickRandomDrawer } from '../data/mockPlayers';
import '../styles/App.css';

const RECENT_WORD_MEMORY = 8;
const YOU_ID = 'you';
const BOT_MIN_DELAY_MS = 1500;
const BOT_MAX_DELAY_MS = 5000;
const BOT_CORRECT_CHANCE = 0.55;

/** 1., 2., 3. bilen bu kadar puan alır; sonrakiler sabit 3 puanla yetinir. */
const GUESS_RANK_POINTS = [10, 7, 5];
const GUESS_FALLBACK_POINTS = 3;
/** Çizen kişi, o turu doğru bilen herkes için bu kadar puan kazanır. */
const DRAWER_POINTS_PER_CORRECT_GUESSER = 2;

function normalize(text: string) {
  return text.trim().toLocaleLowerCase('tr');
}

/**
 * Standalone prototip. Bu adımda eklenen: sohbet/tahmin kutusu. Doğru
 * tahmin sohbete kelimeyi hiç taşımıyor, sadece "kim kaçıncı oldu"
 * bilgisini gösteriyor — hâlâ bilemeyenler için kelime gizli kalsın diye.
 * Gerçek oyuncular henüz yok; botlar (Ada/Mert/Ece) rastgele gecikmeyle
 * kâh doğru kâh yanlış tahminler atarak sohbeti test edilebilir kılıyor.
 */
export function App() {
  const [word, setWord] = useState(() => pickRandomWord());
  const [recentWords, setRecentWords] = useState<string[]>([word]);
  const [drawerId, setDrawerId] = useState(() => pickRandomDrawer(MOCK_PLAYERS).id);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [correctGuesserIds, setCorrectGuesserIds] = useState<string[]>([]);
  const [scores, setScores] = useState<Record<string, number>>({});

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
              onSubmit={(text) => submitGuess(YOU_ID, 'Sen', text)}
            />
            <ScoreBoard players={MOCK_PLAYERS} scores={scores} />
          </div>
        </div>
      </div>
    </div>
  );
}
