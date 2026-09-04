import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { WheelSpinSnapshot } from '@retro-platform/contracts';
import {
  readableLabelRotation,
  spinProgress,
  truncateWheelLabel,
  wheelLabelGeometry,
  wheelLabelWidthPercent,
  wheelRotation,
} from './wheelMath';

interface WheelItem { id: string; label: string }

interface WheelProps {
  items: readonly WheelItem[];
  spin?: WheelSpinSnapshot;
  selectedId?: string;
  inactive?: boolean;
  ariaLabel: string;
  now?: () => number;
}

const colors = ['#f6c453', '#28c7c9', '#ec5b87', '#7568d8', '#2e8acb', '#e68b3a', '#6ac878', '#d86ac5'];

export function Wheel({ items, spin, selectedId, inactive, ariaLabel, now: authoritativeNow = Date.now }: WheelProps) {
  const [now, setNow] = useState(() => authoritativeNow());
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const animationNow = spin && reducedMotion ? spin.startedAtUnixMs + spin.durationMs : now;
  const spinning = Boolean(spin && spinProgress(spin, animationNow) < 1);

  useEffect(() => {
    if (!spin || reducedMotion) return;
    let frame = 0;
    const draw = () => {
      const current = authoritativeNow();
      setNow(current);
      if (current < spin.startedAtUnixMs + spin.durationMs) frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [spin?.spinId, reducedMotion, authoritativeNow]);

  const background = useMemo(() => {
    if (items.length === 0) return '#20274d';
    const slice = 360 / items.length;
    const divider = Math.min(1.8, slice * 0.06);
    const stops = items.flatMap((item, index) => {
      const start = index * slice;
      const end = (index + 1) * slice;
      const color = !spinning && item.id === selectedId ? '#fff0a8' : colors[index % colors.length];
      return [
        `#080b1c ${start}deg ${start + divider}deg`,
        `${color} ${start + divider}deg ${end - divider}deg`,
        `#080b1c ${end - divider}deg ${end}deg`,
      ];
    });
    return `conic-gradient(from -90deg, ${stops.join(',')})`;
  }, [items, selectedId, spinning]);
  const rotation = spin ? wheelRotation(spin, items.length, animationNow) : 0;
  const style = { '--wheel-rotation': `${rotation}deg`, background } as CSSProperties;

  return (
    <div className={`wheel-machine ${inactive ? 'is-inactive' : ''} ${spinning ? 'is-spinning' : ''}`}>
      <div className="wheel-pointer" aria-hidden="true" />
      <div className="wheel-shell">
        <div className="wheel" style={style} role="img" aria-label={ariaLabel}>
          {items.map((item, index) => {
            const geometry = wheelLabelGeometry(index, items.length);
            const readableRotation = readableLabelRotation(geometry.centerAngleDeg, rotation);
            const labelWidth = wheelLabelWidthPercent(items.length);
            const fontSize = items.length >= 9 ? 9 : items.length >= 7 ? 10 : items.length >= 5 ? 11 : 12;
            return (
              <span
                className={`wheel-label ${!spinning && item.id === selectedId ? 'is-selected' : ''}`}
                style={{
                  left: `${geometry.xPercent}%`,
                  top: `${geometry.yPercent}%`,
                  width: `${labelWidth}%`,
                  height: `${fontSize * 1.4}px`,
                  fontSize: `${fontSize}px`,
                  transform: `translate(-50%, -50%) rotate(${readableRotation}deg)`,
                }}
                key={item.id}
                title={item.label}
              >
                <b>{truncateWheelLabel(item.label, items.length)}</b>
              </span>
            );
          })}
          <span className="wheel-hub" aria-hidden="true"><i /></span>
        </div>
      </div>
      {!spinning && selectedId && <div className="pixel-sparks" aria-hidden="true"><i /><i /><i /><i /></div>}
    </div>
  );
}
