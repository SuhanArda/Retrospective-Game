export interface SmoothedTankPosition {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  velocityX: number;
  velocityY: number;
}

export function createSmoothedTankPosition(x: number, y: number): SmoothedTankPosition {
  return { x, y, targetX: x, targetY: y, velocityX: 0, velocityY: 0 };
}

export function retargetTankPosition(
  position: SmoothedTankPosition,
  x: number,
  y: number,
  snap = false,
): void {
  position.targetX = x;
  position.targetY = y;
  if (!snap) return;
  position.x = x;
  position.y = y;
  position.velocityX = 0;
  position.velocityY = 0;
}

export function advanceTankPosition(
  position: SmoothedTankPosition,
  deltaMs: number,
  smoothTimeMs: number,
  maxFrameMs: number,
): boolean {
  const deltaSeconds = Math.min(Math.max(deltaMs, 0), maxFrameMs) / 1_000;
  if (deltaSeconds === 0) return false;
  const beforeX = position.x;
  const beforeY = position.y;
  [position.x, position.velocityX] = smoothDamp(
    position.x, position.targetX, position.velocityX, deltaSeconds, smoothTimeMs / 1_000,
  );
  [position.y, position.velocityY] = smoothDamp(
    position.y, position.targetY, position.velocityY, deltaSeconds, smoothTimeMs / 1_000,
  );
  return Math.abs(position.x - beforeX) > 0.01 || Math.abs(position.y - beforeY) > 0.01;
}

function smoothDamp(
  current: number,
  target: number,
  velocity: number,
  deltaSeconds: number,
  smoothTimeSeconds: number,
): readonly [number, number] {
  const omega = 2 / Math.max(0.001, smoothTimeSeconds);
  const scaledDelta = omega * deltaSeconds;
  const decay = 1 / (1 + scaledDelta + 0.48 * scaledDelta ** 2 + 0.235 * scaledDelta ** 3);
  const difference = current - target;
  const temporary = (velocity + omega * difference) * deltaSeconds;
  const nextVelocity = (velocity - omega * temporary) * decay;
  const next = target + (difference + temporary) * decay;
  if (Math.abs(target - next) < 0.02 && Math.abs(nextVelocity) < 0.2) return [target, 0];
  return [next, nextVelocity];
}
