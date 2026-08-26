export const MAX_SPIN_PLAYERS = 10;

export type CatSeatPosition = Readonly<{
  xPercent: number;
  yPercent: number;
  zIndex: number;
}>;

function assertPlayerIndex(index: number, playerCount: number): void {
  if (!Number.isInteger(playerCount) || playerCount < 1 || playerCount > MAX_SPIN_PLAYERS) {
    throw new RangeError(`playerCount must be between 1 and ${MAX_SPIN_PLAYERS}`);
  }
  if (!Number.isInteger(index) || index < 0 || index >= playerCount) {
    throw new RangeError("index must identify an active player");
  }
}

export function getSpinTargetAngle(index: number, playerCount: number): number {
  assertPlayerIndex(index, playerCount);
  return Math.round((index * 360) / playerCount);
}

export function getCatSeatPosition(index: number, playerCount: number): CatSeatPosition {
  assertPlayerIndex(index, playerCount);

  const crowded = playerCount >= 8;
  const horizontalRadius = crowded ? 43.5 : 42;
  // Keep every cat on the rug: move the ellipse centre down, flatten its back
  // edge away from the fireplace, and preserve the front edge at 92%.
  const verticalCenter = 62;
  const verticalRadius = 30;
  const angleRadians = (-90 + (index * 360) / playerCount) * (Math.PI / 180);
  const xPercent = 50 + horizontalRadius * Math.cos(angleRadians);
  const yPercent = verticalCenter + verticalRadius * Math.sin(angleRadians);

  return {
    xPercent: Number(xPercent.toFixed(3)),
    yPercent: Number(yPercent.toFixed(3)),
    zIndex: 10 + Math.round(yPercent),
  };
}
