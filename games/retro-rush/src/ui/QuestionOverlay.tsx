import { useEffect, useRef } from 'react';
import type { PresentedRetroQuestion } from '../domain/types';
import { retroQuestionCategoryLabels } from './retroRushLabels';

interface Props {
  question: PresentedRetroQuestion;
  mode: 'verbal';
  onAnswered: () => void;
}

export function QuestionOverlay({ question, mode, onAnswered }: Props) {
  const confirmationRef = useRef<HTMLButtonElement>(null);
  useEffect(() => confirmationRef.current?.focus(), [question.id]);
  const title = question.canConfirm || !question.ownerName ? 'Son sıradaki oyuncunun sorusu' : `${question.ownerName} adlı oyuncunun sorusu`;

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="dialog question-dialog" data-answer-mode={mode} data-question-id={question.id} data-owner-player-id={question.ownerPlayerId} role="dialog" aria-modal="true" aria-labelledby="question-title">
        <p className="eyebrow">{retroQuestionCategoryLabels[question.category]}</p>
        <h2 id="question-title">{title}</h2>
        <p className="question-prompt">{question.prompt}</p>
        <p className="gentle-note">Bu soruyu ekibinle sözlü olarak yanıtla.</p>
        {question.canConfirm
          ? <div className="dialog-actions"><button ref={confirmationRef} className="button primary" type="button" onClick={onAnswered}>CEVAPLADIM &mdash; DEVAM ET</button></div>
          : <p className="gentle-note">{question.ownerName ?? 'Soru sahibi'} bekleniyor...</p>}
      </section>
    </div>
  );
}
