import { describe, expect, it } from 'vitest';
import { fallbackWordPacks } from './gameContent';

describe('Imposter demo word catalogue', () => {
  it('contains thirty unique words with a dedicated retrospective question', () => {
    expect(fallbackWordPacks).toHaveLength(30);
    expect(new Set(fallbackWordPacks.map((pack) => pack.secretWord.toLocaleLowerCase('tr-TR'))).size).toBe(30);
    expect(fallbackWordPacks.every((pack) => pack.retroQuestion.trim().length > 0)).toBe(true);
    expect(fallbackWordPacks[0]).toEqual({
      category: 'Çevik Süreç',
      secretWord: 'Sprint',
      retroQuestion: 'Bu sprintte ne daha iyi yapılabilirdi?',
    });
  });
});
