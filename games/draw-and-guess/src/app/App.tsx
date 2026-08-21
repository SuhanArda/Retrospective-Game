import { useState } from 'react';
import { DrawingCanvas } from '../components/DrawingCanvas';
import { pickRandomWord } from '../data/words';
import '../styles/App.css';

const RECENT_WORD_MEMORY = 8;

/**
 * Standalone prototip — henüz oda/oyuncu/skor yok, sadece kelime döngüsü ve
 * çizim yüzeyi çalışıyor mu diye. Oyuncu listesi, tahmin sohbeti, skor
 * tablosu ve gerçek zamanlı senkronizasyon sonraki adımlarda gelecek.
 */
export function App() {
  const [word, setWord] = useState(() => pickRandomWord());
  const [recentWords, setRecentWords] = useState<string[]>([word]);

  function handleNextWord() {
    const next = pickRandomWord(recentWords);
    setWord(next);
    setRecentWords((current) => [next, ...current].slice(0, RECENT_WORD_MEMORY));
  }

  return (
    <div className="page">
      <div className="page-content">
        <div className="brand">Draw & Guess</div>
        <h1 className="title">Çiz, tahmin et</h1>

        <div className="word-panel">
          <span className="word-panel-label">Çizilecek kelime</span>
          <span className="word-panel-word">{word}</span>
          <button type="button" className="btn-secondary" onClick={handleNextWord}>
            Yeni kelime
          </button>
        </div>

        <DrawingCanvas />
      </div>
    </div>
  );
}
