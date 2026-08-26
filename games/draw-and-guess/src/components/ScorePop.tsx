import { useEffect } from 'react';

const LIFETIME_MS = 1600;

interface ScorePopProps {
  points: number;
  onDone: () => void;
}

/**
 * Doğru tahmin ettiğinde ekranın ortasında beliren "+10" — büyüyerek gelir,
 * sonra yavaşça solarak kaybolur. Sadece o tahmini yapan kişinin kendi
 * ekranında görünür (App.tsx bunu playerId eşleşmesine göre tetikler).
 */
export function ScorePop({ points, onDone }: ScorePopProps) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, LIFETIME_MS);
    return () => window.clearTimeout(timer);
  }, [onDone]);

  return (
    <div className="score-pop" aria-hidden="true">+{points}</div>
  );
}
