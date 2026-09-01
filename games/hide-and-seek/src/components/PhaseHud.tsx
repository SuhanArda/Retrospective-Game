import { useEffect, useState } from 'react';
import type { HideAndSeekPhase, HideAndSeekRole } from '@retro-platform/contracts';
import { HideSeekConfig } from '../domain/config';

const PHASE_LABELS: Record<HideAndSeekPhase, string> = {
  PREP: 'Hazırlanıyor',
  DARK: 'Karanlık',
  REVEAL: 'Aydınlanma',
  ENDED: 'Bitti',
};

function secondsLeft(endsAtUtc: number): number {
  return Math.max(0, Math.ceil((endsAtUtc - Date.now()) / 1000));
}

interface PhaseHudProps {
  phase: HideAndSeekPhase;
  phaseEndsAtUtc: number;
  role: HideAndSeekRole;
}

/**
 * Phase name + countdown — reads purely off the server's `phaseEndsAtUtc`,
 * same idiom as draw-and-guess's `RoundTimer`. The phase itself only ever
 * changes when the server says so (a `hideAndSeekStateChanged` event); this
 * component never decides a transition on its own, it just counts down to
 * one that's already scheduled.
 */
export function PhaseHud({ phase, phaseEndsAtUtc, role }: PhaseHudProps) {
  const [remaining, setRemaining] = useState(() => secondsLeft(phaseEndsAtUtc));

  useEffect(() => {
    setRemaining(secondsLeft(phaseEndsAtUtc));
    const interval = window.setInterval(() => setRemaining(secondsLeft(phaseEndsAtUtc)), 250);
    return () => window.clearInterval(interval);
  }, [phaseEndsAtUtc]);

  // A blinking warning in the last few seconds of DARK, right before REVEAL hits — the spec's "bunu çok daha gerilimli yapıyor" beat.
  const revealWarning = phase === 'DARK' && remaining <= HideSeekConfig.REVEAL_WARNING_SEC;

  return (
    <div className={`phase-hud phase-hud-${phase.toLowerCase()}${revealWarning ? ' phase-hud-warning' : ''}`}>
      <span className="phase-hud-role">{role === 'SEEKER' ? 'Sen ebesin' : 'Saklan!'}</span>
      <span className="phase-hud-phase">{PHASE_LABELS[phase]}</span>
      {phase !== 'ENDED' && <span className="phase-hud-countdown">{remaining}s</span>}
    </div>
  );
}
