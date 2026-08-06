import { describe, expect, it, vi } from 'vitest';
import { GameEventBridge } from './GameEventBridge';
import { retroQuestions } from '../data/retroQuestions';

describe('game flow event bridge', () => {
  it('opens the elimination question and carries the answer to respawn logic', () => {
    const bridge = new GameEventBridge();
    const questionListener = vi.fn(); const answerListener = vi.fn();
    bridge.on('questionOpened', questionListener); bridge.on('answerSubmitted', answerListener);
    const question = retroQuestions[0]!;
    bridge.emit('questionOpened', question);
    bridge.emit('answerSubmitted', { question, value: 'Reviews were smooth', skipped: false });
    expect(questionListener).toHaveBeenCalledWith(question);
    expect(answerListener).toHaveBeenCalledWith(expect.objectContaining({ value: 'Reviews were smooth' }));
  });
});
