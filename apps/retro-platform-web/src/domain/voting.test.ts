import { describe, expect, it } from 'vitest';
import { resolveVoteOutcome, tallyVotes } from './voting';

const CANDIDATES = ['retro-rush', 'pixel-arena', 'sprint-maze'];

describe('tallyVotes', () => {
  it('counts one vote per player', () => {
    expect(tallyVotes({ p1: 'retro-rush', p2: 'retro-rush', p3: 'pixel-arena' })).toEqual({
      'retro-rush': 2,
      'pixel-arena': 1,
    });
  });

  it('returns an empty tally when nobody voted', () => {
    expect(tallyVotes(undefined)).toEqual({});
    expect(tallyVotes({})).toEqual({});
  });
});

describe('resolveVoteOutcome', () => {
  it('picks the game with the most votes and reports no tie', () => {
    const outcome = resolveVoteOutcome(
      { p1: 'pixel-arena', p2: 'pixel-arena', p3: 'retro-rush' },
      CANDIDATES,
    );
    expect(outcome).toEqual({ winner: 'pixel-arena', tiedCandidates: ['pixel-arena'] });
  });

  it('breaks a draw at random between only the tied games', () => {
    const votes = { p1: 'retro-rush', p2: 'pixel-arena', p3: 'sprint-maze' };
    // random() near 1 must still land inside the array rather than overflowing.
    const outcome = resolveVoteOutcome(votes, CANDIDATES, () => 0.999999);
    expect(outcome?.tiedCandidates).toEqual(CANDIDATES);
    expect(outcome?.winner).toBe('sprint-maze');

    const first = resolveVoteOutcome(votes, CANDIDATES, () => 0);
    expect(first?.winner).toBe('retro-rush');
  });

  it('reports a two-way tie without including the game nobody voted for', () => {
    const outcome = resolveVoteOutcome(
      { p1: 'retro-rush', p2: 'pixel-arena' },
      CANDIDATES,
      () => 0,
    );
    expect(outcome?.tiedCandidates).toEqual(['retro-rush', 'pixel-arena']);
  });

  it('falls back to a random game when nobody voted', () => {
    const outcome = resolveVoteOutcome({}, CANDIDATES, () => 0.5);
    expect(outcome?.tiedCandidates).toEqual(CANDIDATES);
    expect(CANDIDATES).toContain(outcome?.winner);
  });

  it('ignores votes for games that are no longer offered', () => {
    const outcome = resolveVoteOutcome({ p1: 'deleted-game', p2: 'retro-rush' }, CANDIDATES);
    expect(outcome).toEqual({ winner: 'retro-rush', tiedCandidates: ['retro-rush'] });
  });

  it('returns null when there are no candidates at all', () => {
    expect(resolveVoteOutcome({ p1: 'retro-rush' }, [])).toBeNull();
  });
});
