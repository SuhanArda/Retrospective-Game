import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RetroQuestion } from '../domain/types';
import { QuestionOverlay } from './QuestionOverlay';

const question: RetroQuestion = { id: 'q1', category: 'Improvement', type: 'singleChoice', prompt: 'What should improve next sprint?', options: ['A', 'B'], required: true };

describe('verbal question overlay', () => {
  it('shows the prompt and category without written or choice inputs', () => {
    const view = render(<QuestionOverlay question={question} mode="verbal" onAnswered={() => undefined} />);
    expect(view.getByText(question.prompt)).toBeInTheDocument();
    expect(view.getByText(question.category)).toBeInTheDocument();
    expect(view.getByText(/answer this question verbally/i)).toBeInTheDocument();
    expect(view.queryByRole('textbox')).not.toBeInTheDocument();
    expect(view.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('focuses the single confirmation and invokes it without answer validation', () => {
    const onAnswered = vi.fn();
    const view = render(<QuestionOverlay question={question} mode="verbal" onAnswered={onAnswered} />);
    const button = view.getByRole('button', { name: /answered.*restart/i });
    expect(button).toHaveFocus();
    fireEvent.click(button);
    expect(onAnswered).toHaveBeenCalledOnce();
  });
});
