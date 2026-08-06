export interface Vector2 { x: number; y: number }
export interface Bounds { left: number; right: number; top: number; bottom: number }

export function segmentIntersectsExpandedAabb(start: Vector2, end: Vector2, bounds: Bounds, expansion: number) {
  const expanded = {
    left: bounds.left - expansion,
    right: bounds.right + expansion,
    top: bounds.top - expansion,
    bottom: bounds.bottom + expansion,
  };
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  let minimumTime = 0;
  let maximumTime = 1;

  for (const [origin, movement, minimum, maximum] of [[start.x, dx, expanded.left, expanded.right], [start.y, dy, expanded.top, expanded.bottom]] as const) {
    if (Math.abs(movement) <= Number.EPSILON) {
      if (origin < minimum || origin > maximum) return false;
      continue;
    }
    const first = (minimum - origin) / movement;
    const second = (maximum - origin) / movement;
    minimumTime = Math.max(minimumTime, Math.min(first, second));
    maximumTime = Math.min(maximumTime, Math.max(first, second));
    if (minimumTime > maximumTime) return false;
  }
  return true;
}
