interface WordHintProps {
  wordLength: number;
  revealedLetters: Readonly<Record<number, string>>;
}

/**
 * Kelimenin harf sayısı kadar çizgi — çizenin "Harf Ver" ile açtığı harfler
 * yerlerine oturur, geri kalanı `_` olarak kalır. Sadece görüntüler, tahmin
 * edenler bunu değiştiremez.
 */
export function WordHint({ wordLength, revealedLetters }: WordHintProps) {
  return (
    <div className="word-hint">
      {Array.from({ length: wordLength }, (_, index) => (
        <span key={index} className="word-hint-letter">{revealedLetters[index] ?? '_'}</span>
      ))}
    </div>
  );
}
