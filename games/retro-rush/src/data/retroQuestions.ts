import type { RetroQuestion } from '../domain/types';

export const retroQuestions: readonly RetroQuestion[] = [
  { id: 'q1', category: 'Went well', type: 'text', prompt: 'What went well during this sprint?', required: true },
  { id: 'q2', category: 'Challenges', type: 'text', prompt: 'What slowed the team down?', required: true },
  { id: 'q3', category: 'Improvement', type: 'text', prompt: 'What should we do differently next sprint?', required: true },
  { id: 'q4', category: 'Appreciation', type: 'text', prompt: 'Who would you like to thank, and why?', required: false },
  { id: 'q5', category: 'Challenges', type: 'singleChoice', prompt: 'Which area needs the most attention?', options: ['Planning', 'Communication', 'Tooling', 'Focus'], required: true },
  { id: 'q6', category: 'Team mood', type: 'rating', prompt: 'How would you rate this sprint?', options: ['1', '2', '3', '4', '5'], required: true },
  { id: 'q7', category: 'Next sprint', type: 'text', prompt: 'What is one action the team should take next?', required: true },
  { id: 'q8', category: 'Went well', type: 'text', prompt: 'Which collaboration moment helped most?', required: false },
  { id: 'q9', category: 'Improvement', type: 'singleChoice', prompt: 'Where could we reduce friction?', options: ['Meetings', 'Reviews', 'Deployments', 'Handoffs'], required: true },
  { id: 'q10', category: 'Team mood', type: 'rating', prompt: 'How sustainable did our pace feel?', options: ['1', '2', '3', '4', '5'], required: true },
  { id: 'q11', category: 'Appreciation', type: 'text', prompt: 'What team behavior should we celebrate?', required: false },
  { id: 'q12', category: 'Challenges', type: 'text', prompt: 'Which process took more time than expected?', required: true },
  { id: 'q13', category: 'Next sprint', type: 'singleChoice', prompt: 'What should we protect more next sprint?', options: ['Focus time', 'Quality', 'Learning', 'Team connection'], required: true },
  { id: 'q14', category: 'Went well', type: 'text', prompt: 'What helped you feel confident this sprint?', required: false },
  { id: 'q15', category: 'Improvement', type: 'text', prompt: 'What small experiment should we try next?', required: true },
];
