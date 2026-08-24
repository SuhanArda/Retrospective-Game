import type { GeneratedQuestion } from '@retro-platform/contracts';
import type { WordPack } from '../domain/types';
import { fallbackWordPacks } from './gameContent';

/**
 * Converts the shared room question shape into the local Imposter round shape.
 * It never generates or fetches questions; room ownership stays in the shared
 * RoomQuestionProvider and the AI service.
 */
export function adaptImposterQuestions(questions: readonly GeneratedQuestion[]): readonly WordPack[] {
  return questions.flatMap((question) => {
    const secretWord = question.answer.trim();
    const retroQuestion = question.text.trim();
    if (!secretWord || !retroQuestion) return [];

    return [{
      category: question.category ?? 'AI',
      secretWord,
      retroQuestion,
    }];
  });
}

/** Keeps the existing local demo catalogue when no valid room questions exist. */
export function resolveImposterWordPacks(
  questions: readonly GeneratedQuestion[] | null | undefined,
): readonly WordPack[] {
  if (!questions?.length) return fallbackWordPacks;
  const adapted = adaptImposterQuestions(questions);
  return adapted.length > 0 ? adapted : fallbackWordPacks;
}
