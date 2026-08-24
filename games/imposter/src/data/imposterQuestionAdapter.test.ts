import { describe, expect, it } from 'vitest';
import type { GeneratedQuestion } from '@retro-platform/contracts';
import { fallbackWordPacks } from './gameContent';
import { adaptImposterQuestions, resolveImposterWordPacks } from './imposterQuestionAdapter';

describe('Imposter question adapter', () => {
  it('maps answer to the secret word and text to the end-of-round question', () => {
    const questions: GeneratedQuestion[] = [{
      id: 'question-1',
      answer: '  Ahtapot  ',
      text: '  Deniz canlıları ekip çalışmasını düşünmemize nasıl yardımcı olur?  ',
      category: 'reflection',
    }];

    expect(adaptImposterQuestions(questions)).toEqual([{
      category: 'reflection',
      secretWord: 'Ahtapot',
      retroQuestion: 'Deniz canlıları ekip çalışmasını düşünmemize nasıl yardımcı olur?',
    }]);
  });

  it('keeps the existing demo catalogue when AI room questions are unavailable', () => {
    expect(resolveImposterWordPacks(undefined)).toBe(fallbackWordPacks);
    expect(resolveImposterWordPacks([])).toBe(fallbackWordPacks);
  });

  it('falls back when room questions cannot form a usable word pack', () => {
    const invalidQuestions: GeneratedQuestion[] = [{ id: 'question-1', answer: ' ', text: ' ' }];

    expect(resolveImposterWordPacks(invalidQuestions)).toBe(fallbackWordPacks);
  });
});
