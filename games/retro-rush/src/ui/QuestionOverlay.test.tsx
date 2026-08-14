import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PresentedRetroQuestion } from '../domain/types';
import { QuestionOverlay } from './QuestionOverlay';

const question: PresentedRetroQuestion = { id: 'q1', category: 'Improvement', type: 'singleChoice', prompt: 'Bir sonraki sprintte neyi iyileştirmeliyiz?', options: ['A', 'B'], required: true, canConfirm: true };

describe('verbal question overlay', () => {
  it('shows the prompt and category without written or choice inputs', () => {
    const view = render(<QuestionOverlay question={question} mode="verbal" onAnswered={() => undefined} />);
    expect(view.getByText(question.prompt)).toBeInTheDocument();
    expect(view.getByText('İYİLEŞTİRME')).toBeInTheDocument();
    expect(view.getByText('Bu soruyu ekibinle sözlü olarak yanıtla.')).toBeInTheDocument();
    expect(view.queryByRole('textbox')).not.toBeInTheDocument();
    expect(view.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('focuses the single confirmation and invokes it without answer validation', () => {
    const onAnswered = vi.fn();
    const view = render(<QuestionOverlay question={question} mode="verbal" onAnswered={onAnswered} />);
    const button = view.getByRole('button', { name: 'CEVAPLADIM — YENİDEN BAŞLAT' });
    expect(button).toHaveFocus();
    fireEvent.click(button);
    expect(onAnswered).toHaveBeenCalledOnce();
  });

  it('shows the shared question to observers without restart authority', () => {
    const onAnswered = vi.fn();
    const view = render(<QuestionOverlay question={{ ...question, ownerName: 'Ali', canConfirm: false }} mode="verbal" onAnswered={onAnswered} />);
    expect(view.getByRole('heading', { name: 'Ali adlı oyuncunun sorusu' })).toBeInTheDocument();
    expect(view.getByText('Ali bekleniyor...')).toBeInTheDocument();
    expect(view.queryByRole('button', { name: 'CEVAPLADIM — YENİDEN BAŞLAT' })).not.toBeInTheDocument();
  });
});
