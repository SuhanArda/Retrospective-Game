import type { MatchSnapshot, RetroAnswer } from '../domain/types';
import { retroQuestions } from '../data/retroQuestions';
import { retroQuestionCategoryLabels } from './retroRushLabels';

interface Props { snapshot: MatchSnapshot; answers: readonly RetroAnswer[]; onRestart: () => void }

export function ResultsScreen({ snapshot, answers, onRestart }: Props) {
  const ordered = [...snapshot.players].sort((a, b) => (a.finishPosition ?? 99) - (b.finishPosition ?? 99));
  return <div className="modal-backdrop results-backdrop"><section className="dialog results" role="dialog" aria-modal="true" aria-labelledby="results-title">
    <p className="eyebrow">Parkur tamamlandı</p><h2 id="results-title">Orman kulübesine ulaştınız!</h2><p className="gentle-note">Patikadaki her dönüş, yararlı bir değerlendirmeye alan açtı.</p>
    <div className="results-columns"><div><h3>Koşu özeti</h3><ol className="standings">{ordered.map((player) => <li key={player.id}><span>{player.icon}</span><strong>{player.name}</strong><small>{player.finishPosition ? `#${player.finishPosition}. sırada tamamladı` : 'Parkurda'} · {player.eliminations} soru</small></li>)}</ol></div>
    <div><h3>Değerlendirme kartların ({answers.length})</h3><div className="answer-list">{answers.length ? answers.map((answer) => { const question = retroQuestions.find((item) => item.id === answer.questionId); return <article key={`${answer.questionId}-${answer.answeredAt}`}><small>{question ? retroQuestionCategoryLabels[question.category] : ''}</small><strong>{question?.prompt}</strong><p>{answer.value}</p></article>; }) : <p className="empty">Bu koşuda yanıt toplanmadı.</p>}</div></div></div>
    <button className="button primary" type="button" onClick={onRestart}>DENEME MAÇINI YENİDEN BAŞLAT</button>
  </section></div>;
}
