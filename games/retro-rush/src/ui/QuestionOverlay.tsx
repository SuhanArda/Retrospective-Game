import { useEffect, useRef } from 'react';
import type { RetroQuestion } from '../domain/types';

interface Props {
  question: RetroQuestion;
  mode: 'verbal';
  onAnswered: () => void;
}

export function QuestionOverlay({ question, mode, onAnswered }: Props) {
  const confirmationRef = useRef<HTMLButtonElement>(null);
  useEffect(() => confirmationRef.current?.focus(), []);

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="dialog question-dialog" data-answer-mode={mode} role="dialog" aria-modal="true" aria-labelledby="question-title">
        <p className="eyebrow">{question.category}</p>
        <h2 id="question-title">Retro question</h2>
        <p className="question-prompt">{question.prompt}</p>
        <p className="gentle-note">Answer this question verbally with your team.</p>
        <div className="dialog-actions">
          <button ref={confirmationRef} className="button primary" type="button" onClick={onAnswered}>Answered &mdash; Restart</button>
        </div>
      </section>
    </div>
  );
}
