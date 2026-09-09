import type { HideAndSeekRole } from '@retro-platform/contracts';
import { ALLY_FILL, SELF_FILL, SEEKER_FILL } from '../game/HideSeekCanvas';

interface RoleLegendProps {
  localRole: HideAndSeekRole;
}

/**
 * A tiny color key for the token ring colors — without it, "why is that
 * player blue and this one green" isn't obvious on first look. Role-aware
 * rather than a fixed three-line legend: `tokenColorFor` in `HideSeekCanvas`
 * colors red for "the seeker" specifically (self included, if you are the
 * seeker) and green only for a hider's own token — a seeker sees every
 * hider as blue, the same "not-the-seeker" color a hider sees their fellow
 * hiders as. So the seeker's legend is "Sen" (red) + "Saklananlar" (blue),
 * never a single "everyone's red" line.
 */
export function RoleLegend({ localRole }: RoleLegendProps) {
  const rows = localRole === 'SEEKER'
    ? [
        { color: SEEKER_FILL, label: 'Sen' },
        { color: ALLY_FILL, label: 'Saklananlar' },
      ]
    : [
        { color: SELF_FILL, label: 'Sen' },
        { color: ALLY_FILL, label: 'Arkadaşın' },
        { color: SEEKER_FILL, label: 'Ebe' },
      ];

  return (
    <div className="role-legend">
      {rows.map((row) => (
        <span key={row.label} className="role-legend-row">
          <i className="role-legend-dot" style={{ background: row.color }} />
          {row.label}
        </span>
      ))}
    </div>
  );
}
