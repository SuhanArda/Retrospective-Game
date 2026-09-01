import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QuestionOverlay } from './QuestionOverlay';

describe('spoken Tank Battle question', () => {
  it('uses a verbal confirmation without a text input', () => {
    const onComplete = vi.fn();
    render(<QuestionOverlay prompt="Takım olarak ne öğrendiniz?" canConfirm hasConfirmed={false}
      answeredCount={0} requiredCount={2} onComplete={onComplete} />);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText(/yüksek sesle/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'SESLİ YANITI TAMAMLADIK' }));
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it('shows synchronized waiting state to players who do not own the question', () => {
    render(<QuestionOverlay prompt="Soru" canConfirm={false} hasConfirmed={false}
      answeredCount={1} requiredCount={2} onComplete={vi.fn()} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('SENKRONİZE GEÇİŞ BEKLENİYOR');
  });
});
