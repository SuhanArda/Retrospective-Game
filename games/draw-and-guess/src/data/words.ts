/**
 * Herkesin kolayca tanıyıp çizebileceği klasik, somut kelimeler — ofis
 * ortamında rahatça oynanabilecek, kimseyi rahatsız etmeyecek türden.
 * Kategoriler ayrı tutuluyor ki ileride "eğlenceli" gibi yeni bir kategori
 * eklemek (örn. iş jargonu: "toplantı", "deadline") tek satırlık bir iş olsun.
 */
export type WordCategory = 'hayvanlar' | 'araclar' | 'yemekler';

export const WORD_LIST: Readonly<Record<WordCategory, readonly string[]>> = {
  hayvanlar: [
    'kedi', 'köpek', 'aslan', 'fil', 'zürafa', 'penguen', 'kaplumbağa',
    'tavşan', 'kartal', 'balina', 'yılan', 'maymun', 'ayı', 'kelebek',
    'örümcek', 'papağan', 'at', 'inek', 'koyun', 'tavuk',
  ],
  araclar: [
    'araba', 'otobüs', 'uçak', 'tren', 'bisiklet', 'motosiklet', 'gemi',
    'helikopter', 'kamyon', 'traktör', 'roket', 'denizaltı', 'scooter',
    'ambulans', 'itfaiye arabası',
  ],
  yemekler: [
    'pizza', 'hamburger', 'elma', 'muz', 'karpuz', 'dondurma', 'pasta',
    'makarna', 'çikolata', 'ekmek', 'peynir', 'yumurta', 'kahve', 'çay',
    'patates kızartması', 'sushi', 'taco', 'simit',
  ],
};

const ALL_WORDS: readonly string[] = Object.values(WORD_LIST).flat();

/**
 * Son `recentlyUsed` içindeki kelimeleri elemeye çalışır; havuz o kadar
 * daralırsa (oyunun başında ya da çok kısa listede) yine de bir kelime
 * döner — hiç kelime dönmemekten iyidir.
 */
export function pickRandomWord(recentlyUsed: readonly string[] = []): string {
  const pool = ALL_WORDS.filter((word) => !recentlyUsed.includes(word));
  const source = pool.length > 0 ? pool : ALL_WORDS;
  return source[Math.floor(Math.random() * source.length)];
}
