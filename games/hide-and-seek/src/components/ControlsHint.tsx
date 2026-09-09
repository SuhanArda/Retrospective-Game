import { useEffect, useState } from 'react';

/** Long enough to read once, short enough not to keep sitting over the map. */
const VISIBLE_MS = 4000;
/** Must match the CSS transition duration on `.controls-hint-fading` — the hint only leaves the DOM (and stops taking up room in its container) once its own fade-out has actually finished playing. */
const FADE_MS = 500;

interface ControlsHintProps {
  text: string;
  /**
   * `'inline'` sits as another flex child inside whatever pill renders it
   * (standalone mode: alongside the brand in `.hud-overlay`) and collapses
   * its own width as it fades, so the pill visibly shrinks back down.
   * `'toast'` is a self-positioned pill fixed to the bottom-center of the
   * screen (online mode) — the top-left corner is already busy with the
   * phase HUD and host controls, so this teaches the same thing from
   * somewhere that's never fighting for space with anything else.
   */
  variant?: 'inline' | 'toast';
}

/**
 * A one-time "how to move" teaching moment: shows for `VISIBLE_MS`, then
 * fades and collapses away for good — never a permanent fixture sitting
 * over the map. Three stages, not just shown/hidden: 'fading' plays the
 * CSS transition before 'hidden' actually removes the hint from the
 * layout; skipping straight to unmounting would pop it away instantly
 * instead of shrinking/fading smoothly.
 */
export function ControlsHint({ text, variant = 'inline' }: ControlsHintProps) {
  const [phase, setPhase] = useState<'visible' | 'fading' | 'hidden'>('visible');

  useEffect(() => {
    const startFade = window.setTimeout(() => setPhase('fading'), VISIBLE_MS);
    return () => window.clearTimeout(startFade);
  }, []);

  useEffect(() => {
    if (phase !== 'fading') return;
    const remove = window.setTimeout(() => setPhase('hidden'), FADE_MS);
    return () => window.clearTimeout(remove);
  }, [phase]);

  if (phase === 'hidden') return null;

  const baseClass = variant === 'toast' ? 'controls-hint-toast' : 'hint controls-hint';
  return (
    <span className={`${baseClass}${phase === 'fading' ? ' controls-hint-fading' : ''}`}>
      {text}
    </span>
  );
}
