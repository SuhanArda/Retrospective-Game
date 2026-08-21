import { useState } from 'react';
import { DrawingCanvas } from '../components/DrawingCanvas';
import { PlayerList } from '../components/PlayerList';
import { pickRandomWord } from '../data/words';
import { MOCK_PLAYERS, pickRandomDrawer } from '../data/mockPlayers';
import '../styles/App.css';

const RECENT_WORD_MEMORY = 8;
const YOU_ID = 'you';

/**
 * Standalone prototip — henüz gerçek oda/skor/sohbet yok. Bu adımda eklenen:
 * her turda rastgele bir çizen seçilir ve öne çıkar, kelime sadece o "sen"
 * isen görünür — diğer türlü "birisi çiziyor" mesajı görünür, gerçek oyunun
 * gizlilik kuralını (herkes kelimeyi göremez) burada da test edebilelim diye.
 */
export function App() {
  const [word, setWord] = useState(() => pickRandomWord());
  const [recentWords, setRecentWords] = useState<string[]>([word]);
  const [drawerId, setDrawerId] = useState(() => pickRandomDrawer(MOCK_PLAYERS).id);

  const isYouDrawing = drawerId === YOU_ID;
  const drawerName = MOCK_PLAYERS.find((player) => player.id === drawerId)?.name ?? '';

  function handleNextTurn() {
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

        <DrawingCanvas canDraw={isYouDrawing} />
      </div>
    </div>
  );
}
