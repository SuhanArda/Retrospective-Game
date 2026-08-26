import { useEffect, useRef, useState } from 'react';

export interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  /** Doğru tahminlerde asıl kelime hiç taşınmaz — sadece kaçıncı olduğu. 'reveal' ise süre dolup kelime açıklandığında düşer. */
  kind: 'guess' | 'correct' | 'reveal';
  text?: string;
  correctRank?: number;
}

interface GuessChatProps {
  messages: readonly ChatMessage[];
  /** Sen zaten çiziyorsan ya da bu turu doğru bildiysen kutu kapanır. */
  canGuess: boolean;
  /** canGuess false iken hangi placeholder'ın gösterileceğini ayırt eder — doğru bilen "tahmin edemezsin" değil, "doğru bildin" görsün. */
  alreadyCorrect?: boolean;
  onSubmit: (text: string) => void;
}

/**
 * Yanlış tahminler olduğu gibi görünür — asıl eğlence orada. Doğru tahmin
 * kelimeyi hiç ekrana taşımaz, sadece "kim kaçıncı oldu" bilgisi düşer; hâlâ
 * bilemeyenler için kelime gizli kalsın diye.
 */
export function GuessChat({ messages, canGuess, alreadyCorrect = false, onSubmit }: GuessChatProps) {
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setDraft('');
  }

  return (
    <div className="guess-chat">
      <div className="guess-chat-list" ref={listRef}>
        {messages.length === 0 && <p className="guess-chat-empty">Henüz tahmin yok.</p>}
        {messages.map((message) => (
          <div key={message.id} className={`guess-chat-message${message.kind === 'correct' ? ' is-correct' : ''}${message.kind === 'reveal' ? ' is-reveal' : ''}`}>
            {message.kind === 'correct' ? (
              <span>
                🎉 <strong>{message.playerName}</strong> doğru bildi! ({message.correctRank}.)
              </span>
            ) : message.kind === 'reveal' ? (
              <span>Kelime: <strong>{message.text}</strong></span>
            ) : (
              <span>
                <strong>{message.playerName}:</strong> {message.text}
              </span>
            )}
          </div>
        ))}
      </div>
      <form className="guess-chat-form" onSubmit={handleSubmit}>
        <input
          type="text"
          className="guess-chat-input"
          placeholder={canGuess ? 'Tahminini yaz…' : alreadyCorrect ? 'Doğru bildin! 🎉' : 'Bu turda tahmin edemezsin'}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={!canGuess}
        />
        <button type="submit" className="btn-secondary" disabled={!canGuess || !draft.trim()}>
          Gönder
        </button>
      </form>
    </div>
  );
}
