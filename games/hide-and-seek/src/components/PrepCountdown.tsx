import { useEffect, useState } from 'react';
import type { HideAndSeekPhase } from '@retro-platform/contracts';
import { secondsLeft } from './PhaseHud';

interface PrepCountdownProps {
  phase: HideAndSeekPhase;
  phaseEndsAtUtc: number;
}

/**
 * A big countdown number that pops onto the center of the screen and burns
 * away again, once per second, for the whole PREP phase — same "pop in,
 * scale, hold, fade out" idiom as draw-and-guess's `ScorePop`, but red and
 * sharper instead of green and leisurely: this is the ten seconds before
 * the seeker is let loose, not a reward. `PhaseHud`'s small corner "10s"
 * stays untouched; this is purely an added beat, not a replacement.
 *
 * Polls at 100ms rather than `PhaseHud`'s 250ms — the corner text only
 * needs to be readable, but this needs to flip to the next number right as
 * it happens, or the "gelsin gitsin" rhythm reads as late instead of tense.
 */
export function PrepCountdown({ phase, phaseEndsAtUtc }: PrepCountdownProps) {
  const [remaining, setRemaining] = useState(() => secondsLeft(phaseEndsAtUtc));

  useEffect(() => {
    setRemaining(secondsLeft(phaseEndsAtUtc));
    const interval = window.setInterval(() => setRemaining(secondsLeft(phaseEndsAtUtc)), 100);
    return () => window.clearInterval(interval);
  }, [phaseEndsAtUtc]);

  if (phase !== 'PREP' || remaining <= 0) return null;

  return (
    <div className="prep-countdown" aria-hidden="true">
      {/* `key` forces a fresh mount per number, which is what re-triggers the CSS animation — no manual replay logic needed. */}
      <span key={remaining} className="prep-countdown-number">{remaining}</span>
    </div>
  );
}
