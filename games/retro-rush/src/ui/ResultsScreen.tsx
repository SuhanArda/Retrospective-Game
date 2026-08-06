import type { MatchSnapshot, RetroAnswer } from '../domain/types';
import { retroQuestions } from '../data/retroQuestions';

interface Props { snapshot: MatchSnapshot; answers: readonly RetroAnswer[]; onRestart: () => void }

export function ResultsScreen({ snapshot, answers, onRestart }: Props) {
  const ordered = [...snapshot.players].sort((a, b) => (a.finishPosition ?? 99) - (b.finishPosition ?? 99));
  return <div className="modal-backdrop results-backdrop"><section className="dialog results" role="dialog" aria-modal="true" aria-labelledby="results-title">
    <p className="eyebrow">Trail complete</p><h2 id="results-title">Made it to the forest lodge!</h2><p className="gentle-note">Every turn in the trail created space for a useful reflection.</p>
    <div className="results-columns"><div><h3>Run recap</h3><ol className="standings">{ordered.map((player) => <li key={player.id}><span>{player.icon}</span><strong>{player.name}</strong><small>{player.finishPosition ? `#${player.finishPosition} finish` : 'On the course'} · {player.eliminations} prompts</small></li>)}</ol></div>
    <div><h3>Your reflection cards ({answers.length})</h3><div className="answer-list">{answers.length ? answers.map((answer) => { const question = retroQuestions.find((item) => item.id === answer.questionId); return <article key={`${answer.questionId}-${answer.answeredAt}`}><small>{question?.category}</small><strong>{question?.prompt}</strong><p>{answer.value}</p></article>; }) : <p className="empty">No answers collected this run.</p>}</div></div></div>
    <button className="button primary" type="button" onClick={onRestart}>Restart mock match</button>
  </section></div>;
}
