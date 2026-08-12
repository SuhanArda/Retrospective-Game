import { describe, expect, it, vi } from 'vitest';
import { GameEventBridge } from './GameEventBridge';
import { retroQuestions } from '../data/retroQuestions';

describe('game flow event bridge', () => {
  it('opens the elimination question and carries verbal confirmation to round reset logic', () => {
    const bridge = new GameEventBridge();
    const questionListener = vi.fn(); const answerListener = vi.fn();
    bridge.on('questionOpened', questionListener); bridge.on('questionAnswered', answerListener);
    const question = { ...retroQuestions[0]!, canConfirm: true };
    bridge.emit('questionOpened', question);
    bridge.emit('questionAnswered', { questionId: question.id });
    expect(questionListener).toHaveBeenCalledWith(question);
    expect(answerListener).toHaveBeenCalledWith({ questionId: question.id });
  });
});
