interface Props {
  prompt: string;
  canConfirm: boolean;
  hasConfirmed: boolean;
  answeredCount: number;
  requiredCount: number;
  onComplete: () => void;
}

export function QuestionOverlay({ prompt, canConfirm, hasConfirmed, answeredCount, requiredCount, onComplete }: Props) {
  const status = canConfirm
    ? 'Takımınla konuş; cevabınızı yüksek sesle paylaştıktan sonra onayla.'
    : hasConfirmed
      ? 'Sesli yanıtın kaydedildi. Takım arkadaşların bekleniyor.'
      : 'Kaybeden takım soruyu sesli yanıtlıyor. Yeni tur birazdan başlayacak.';
  return <section className="modal question-panel" aria-labelledby="question-title">
    <div className={`voice-orb ${canConfirm ? 'listening' : ''}`} aria-hidden="true"><span>●</span><i /><i /><i /></div>
    <p className="eyebrow">SESLİ RETROSPEKTİF · YAZI GEREKMEZ</p>
    <h1 id="question-title">{prompt}</h1>
    <p className="voice-instruction">{status}</p>
    <div className="voice-progress" aria-label={`${answeredCount}/${requiredCount} oyuncu tamamladı`}>
      <span><i style={{ width: `${requiredCount > 0 ? answeredCount / requiredCount * 100 : 100}%` }} /></span>
      <b>{answeredCount}/{requiredCount} HAZIR</b>
    </div>
    {canConfirm && <button type="button" data-game-ui-interactive="true" onClick={onComplete}><span aria-hidden="true">✓</span> SESLİ YANITI TAMAMLADIK</button>}
    {!canConfirm && <div className="waiting-dots" role="status" aria-live="polite"><i /><i /><i /> SENKRONİZE GEÇİŞ BEKLENİYOR</div>}
  </section>;
}
