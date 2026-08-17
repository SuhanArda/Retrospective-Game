import type { RetroQuestion, RetroQuestionCategory } from '../domain/types';
import type { GeneratedQuestion } from '@retro-platform/contracts';

const categoryMap: Readonly<Record<string, RetroQuestionCategory>> = {
  reflection: 'Went well',
  teamwork: 'Appreciation',
  improvement: 'Improvement',
  fun: 'Team mood',
};

export function adaptRetroRushQuestions(questions: readonly GeneratedQuestion[]): readonly RetroQuestion[] {
  return questions.map((question) => ({
    id: question.id,
    category: question.category ? categoryMap[question.category] ?? 'Challenges' : 'Challenges',
    type: 'text',
    prompt: question.text,
    required: true,
  }));
}
