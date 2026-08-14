import type { RetroQuestion, RetroQuestionCategory } from '../domain/types';

export interface RoomQuestion {
  id: string;
  text: string;
  category: string;
  gameCategory?: 'work' | 'entertainment';
}

const categoryMap: Readonly<Record<string, RetroQuestionCategory>> = {
  reflection: 'Went well',
  teamwork: 'Appreciation',
  improvement: 'Improvement',
  fun: 'Team mood',
};

export function adaptRetroRushQuestions(questions: readonly RoomQuestion[]): readonly RetroQuestion[] {
  return questions.map((question) => ({
    id: question.id,
    category: categoryMap[question.category] ?? 'Challenges',
    type: 'text',
    prompt: question.text,
    required: true,
  }));
}
