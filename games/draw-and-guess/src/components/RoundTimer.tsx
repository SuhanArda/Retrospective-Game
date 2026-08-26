import { useEffect, useState } from 'react';

function secondsLeft(endsAtUtc: number) {
  return Math.max(0, Math.ceil((endsAtUtc - Date.now()) / 1000));
}

interface RoundTimerProps {
  endsAtUtc: number;
}

/**
 * Tur süresi geri sayımı — sunucudaki `roundEndsAtUtc`'ye göre saniye saniye
 * azalır. Süre otoritesi tamamen sunucuda; bu sadece görsel bir sayaç, süre
 * dolunca gerçek turu ilerletme işini sunucu (AdvanceTimedStates) yapar.
 */
export function RoundTimer({ endsAtUtc }: RoundTimerProps) {
  const [remaining, setRemaining] = useState(() => secondsLeft(endsAtUtc));

  useEffect(() => {
    setRemaining(secondsLeft(endsAtUtc));
    const interval = window.setInterval(() => setRemaining(secondsLeft(endsAtUtc)), 1000);
    return () => window.clearInterval(interval);
  }, [endsAtUtc]);

  return <span className="round-timer">{remaining}s</span>;
}
