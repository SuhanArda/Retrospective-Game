export function gameSelectionSecondsRemaining(
  votingEndsAtUtcMs: number | null | undefined,
  nowUtcMs: number,
): number {
  if (typeof votingEndsAtUtcMs !== 'number') return 0;
  return Math.max(0, Math.ceil((votingEndsAtUtcMs - nowUtcMs) / 1000));
}
