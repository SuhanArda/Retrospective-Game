export type VoteMap = Record<string, string>;

export interface VoteOutcome {
  winner: string;
  /**
   * The games that shared the top score. Only meaningful when more than one
   * game tied — the UI uses it to show that the winner was picked at random
   * rather than simply earning the most votes.
   */
  tiedCandidates: string[];
}

export function tallyVotes(votes: VoteMap | undefined): Record<string, number> {
  const tally: Record<string, number> = {};
  for (const gameId of Object.values(votes ?? {})) {
    tally[gameId] = (tally[gameId] ?? 0) + 1;
  }
  return tally;
}

/**
 * Decides which game a room plays. The highest vote count wins; a draw is
 * broken at random between the tied games, and a round where nobody voted
 * falls back to a random pick so the room can never get stuck.
 *
 * `random` is injectable so the outcome can be asserted in tests.
 */
export function resolveVoteOutcome(
  votes: VoteMap | undefined,
  candidateIds: readonly string[],
  random: () => number = Math.random,
): VoteOutcome | null {
  if (candidateIds.length === 0) return null;

  const tally = tallyVotes(votes);
  // Ignore votes for games that are no longer on offer.
  const voted = candidateIds.filter((id) => (tally[id] ?? 0) > 0);

  const pool = voted.length > 0 ? voted : [...candidateIds];
  const topScore = voted.length > 0 ? Math.max(...pool.map((id) => tally[id] ?? 0)) : 0;
  const tiedCandidates = voted.length > 0 ? pool.filter((id) => (tally[id] ?? 0) === topScore) : pool;

  const index = Math.min(tiedCandidates.length - 1, Math.floor(random() * tiedCandidates.length));
  return { winner: tiedCandidates[index], tiedCandidates };
}
