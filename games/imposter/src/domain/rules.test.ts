import { describe, expect, it } from 'vitest';
import { beginClues, castVote, completeSpokenClue, createRound, resolveVotes, submitClue } from './rules';
import type { ImposterPlayer, ImposterRound, WordPack } from './types';

const players: ImposterPlayer[] = ['Ada', 'Bora', 'Cem'].map((displayName, index) => ({
  id: `p${index + 1}`,
  displayName,
  avatarIndex: index,
  isConnected: true,
}));
const pack: WordPack = {
  category: 'Süreç',
  secretWord: 'Planlama',
  retroQuestion: 'Neyi iyileştirebiliriz?',
};

describe('Imposter round rules', () => {
  it('selects exactly one deterministic imposter', () => {
    expect(createRound(players, pack, 1, 0.4).imposterId).toBe('p2');
  });

  it('moves from clues to voting after everybody speaks', () => {
    let round = beginClues(createRound(players, pack, 1, 0));
    round = submitClue(round, 'p1', 'Toplantı');
    round = submitClue(round, 'p2', 'Hazırlık');
    round = submitClue(round, 'p3', 'Tahmin');
    expect(round.phase).toBe('VOTING');
    expect(round.clues).toHaveLength(3);
  });

  it('advances a voice-only clue turn without storing speech', () => {
    let round = beginClues(createRound(players, pack, 1, 0));
    round = completeSpokenClue(round, 'p1');
    expect(round.speakerIndex).toBe(1);
    expect(round.clues).toEqual([{ playerId: 'p1', clue: 'SPOKEN' }]);
  });

  it('rejects the secret word and self votes', () => {
    const round = beginClues(createRound(players, pack, 1, 0));
    expect(() => submitClue(round, 'p1', 'planlama')).toThrow('SECRET_WORD_USED');
    const voting = { ...round, phase: 'VOTING' as const };
    expect(() => castVote(voting, 'p1', 'p1')).toThrow('SELF_VOTE');
  });

  it('resolves a unique correct vote', () => {
    let round: ImposterRound = { ...createRound(players, pack, 1, 0), phase: 'VOTING' };
    round = castVote(round, 'p1', 'p2');
    round = castVote(round, 'p2', 'p1');
    round = castVote(round, 'p3', 'p1');
    expect(resolveVotes(round)).toEqual({ suspectedPlayerIds: ['p1'], imposterCaught: true });
  });
});
