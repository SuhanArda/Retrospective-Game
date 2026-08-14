import { describe, expect, it } from 'vitest';
import { adaptRetroRushQuestions } from './retroRushQuestionAdapter';

describe('adaptRetroRushQuestions', () => {
  it('ortak oda sorularını Retro Rush biçimine dönüştürür', () => {
    const result = adaptRetroRushQuestions([
      { id: 'cat-1', text: 'Kedilerden hangi ekip davranışını öğrenebiliriz?', category: 'teamwork', gameCategory: 'work' },
      { id: 'cat-2', text: 'Takımımız bir kedi olsaydı nasıl hareket ederdi?', category: 'fun', gameCategory: 'entertainment' },
    ]);

    expect(result).toEqual([
      { id: 'cat-1', prompt: 'Kedilerden hangi ekip davranışını öğrenebiliriz?', category: 'Appreciation', type: 'text', required: true },
      { id: 'cat-2', prompt: 'Takımımız bir kedi olsaydı nasıl hareket ederdi?', category: 'Team mood', type: 'text', required: true },
    ]);
  });
});
