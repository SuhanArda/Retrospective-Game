import { describe, expect, it } from 'vitest';
import type { GeneratedQuestion } from '@retro-platform/contracts';
import { questionForStableKey } from '@retro-platform/realtime-client';

const questions: GeneratedQuestion[] = Array.from({ length: 20 }, (_, index) => ({
  id: `q-${index}`, text: `Ortak soru ${index}?`, answer: `Cevap ${index}`,
}));

describe('Rus Ruleti ortak soru adaptörü', () => {
  it('sunucunun ortak indeksini aynı oda bankasından çözer', () => {
    expect(questionForStableKey(questions, 'roulette:7')?.id).toBe('q-7');
  });

  it('bilinmeyen gelecekteki oyun anahtarını da varsayılan adaptörle çözer', () => {
    expect(questionForStableKey(questions, 'future-game:question')).not.toBeNull();
  });
});
