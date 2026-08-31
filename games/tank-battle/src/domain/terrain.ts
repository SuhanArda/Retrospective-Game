import type { TankBattleGameSnapshot } from '@retro-platform/contracts';

export function terrainAt(snapshot: TankBattleGameSnapshot, x: number): number {
  const position = Math.max(0, Math.min(snapshot.terrainHeights.length - 1, x / snapshot.terrainStep));
  const left = Math.floor(position);
  const right = Math.min(left + 1, snapshot.terrainHeights.length - 1);
  const amount = position - left;
  return (snapshot.terrainHeights[left] ?? snapshot.waterY) * (1 - amount)
    + (snapshot.terrainHeights[right] ?? snapshot.waterY) * amount;
}
