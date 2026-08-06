import { useEffect, useRef, useState } from 'react';
import type { RetroQuestion } from '../domain/types';
import { validateQuestionResponse } from '../domain/rules';

interface Props {
  question: RetroQuestion;
  onSubmit: (value: string, skipped: boolean) => void;
}

export function QuestionOverlay({ question, onSubmit }: Props) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);

  const submit = (skipped = false) => {
    const validation = skipped ? null : validateQuestionResponse(question, value);
    if (validation) { setError(validation); return; }
    onSubmit(value.trim(), skipped);
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="dialog question-dialog" role="dialog" aria-modal="true" aria-labelledby="question-title">
        <p className="eyebrow">{question.category}</p>
        <h2 id="question-title" ref={headingRef} tabIndex={-1}>Share a reflection to rejoin</h2>
        <p className="question-prompt">{question.prompt}</p>
        <p className="gentle-note">The match keeps moving while you answer. There are no wrong reflections.</p>
        {question.type === 'text' ? (
          <label className="field">Your reflection
            <textarea autoFocus maxLength={500} value={value} onChange={(event) => setValue(event.target.value)} placeholder="Type what comes to mind…" />
          </label>
        ) : (
          <fieldset className={question.type === 'rating' ? 'choice-row' : 'choice-grid'}>
            <legend>{question.type === 'rating' ? 'Choose 1 (low) to 5 (high)' : 'Choose one'}</legend>
            {question.options?.map((option) => (
              <label key={option} className="choice"><input type="radio" name="answer" value={option} checked={value === option} onChange={() => setValue(option)} /><span>{option}</span></label>
            ))}
          </fieldset>
        )}
        {error && <p className="validation" role="alert">{error}</p>}
        <div className="dialog-actions">
          {!question.required && <button className="button ghost" type="button" onClick={() => submit(true)}>Skip for now</button>}
          <button className="button primary" type="button" onClick={() => submit()}>Submit &amp; rejoin</button>
        </div>
        <p className="privacy"><span aria-hidden="true">◉</span> Mock answers stay in this browser session. Production may support named or anonymous responses.</p>
      </section>
    </div>
  );
}
