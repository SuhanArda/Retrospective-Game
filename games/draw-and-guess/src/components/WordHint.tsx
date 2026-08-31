interface WordHintProps {
  wordLength: number;
  revealedLetters: Readonly<Record<number, string>>;
  /** En son açılan harf — kısaca farklı renkte vurgulanır, "Harf Ver"in bir şey yaptığı hissedilsin diye. */
  lastRevealedIndex?: number;
}

/**
 * Kelimenin harf sayısı kadar çizgi — çizenin "Harf Ver" ile açtığı harfler
 * yerlerine oturur, geri kalanı `_` olarak kalır. Sadece görüntüler, tahmin
 * edenler bunu değiştiremez. Hem çizende (buton yanında, kendi açtığını
 * görsün diye) hem tahmin edenlerde aynı şekilde render edilir.
 */
export function WordHint({ wordLength, revealedLetters, lastRevealedIndex }: WordHintProps) {
  return (
    <div className="word-hint">
      {Array.from({ length: wordLength }, (_, index) => (
        <span
          key={index}
          className={`word-hint-letter${index === lastRevealedIndex ? ' is-latest' : ''}`}
        >
          {revealedLetters[index] ?? '_'}
        </span>
      ))}
    </div>
  );
}
