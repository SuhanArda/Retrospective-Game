export function isRoundStartLocked(
  roundId: number,
  roundStartAtUnixMs: number,
  nowUnixMs = Date.now(),
) {
  return roundId <= 0 || roundStartAtUnixMs <= 0 || nowUnixMs < roundStartAtUnixMs;
}

export function canSendRoundGameplay(
  currentRoundId: number,
  requestedRoundId: number,
  roundStartAtUnixMs: number,
  nowUnixMs = Date.now(),
) {
  return requestedRoundId === currentRoundId &&
    !isRoundStartLocked(currentRoundId, roundStartAtUnixMs, nowUnixMs);
}

export function remainingRoundStartSeconds(roundStartAtUnixMs: number, nowUnixMs = Date.now()) {
  return Math.max(0, Math.ceil((roundStartAtUnixMs - nowUnixMs) / 1_000));
}
