import type { RetroQuestion } from '../domain/types';

export const retroQuestions: readonly RetroQuestion[] = [
  { id: 'q1', category: 'Went well', type: 'text', prompt: 'Bu sprintte neler iyi gitti?', required: true },
  { id: 'q2', category: 'Challenges', type: 'text', prompt: 'Takımı yavaşlatan ne oldu?', required: true },
  { id: 'q3', category: 'Improvement', type: 'text', prompt: 'Bir sonraki sprintte neyi farklı yapmalıyız?', required: true },
  { id: 'q4', category: 'Appreciation', type: 'text', prompt: 'Kime, neden teşekkür etmek istersin?', required: false },
  { id: 'q5', category: 'Challenges', type: 'singleChoice', prompt: 'En çok hangi alana odaklanmamız gerekiyor?', options: ['Planlama', 'İletişim', 'Araçlar', 'Odaklanma'], required: true },
  { id: 'q6', category: 'Team mood', type: 'rating', prompt: 'Bu sprinti nasıl değerlendirirsin?', options: ['1', '2', '3', '4', '5'], required: true },
  { id: 'q7', category: 'Next sprint', type: 'text', prompt: 'Takımın bir sonraki sprintte atması gereken tek adım nedir?', required: true },
  { id: 'q8', category: 'Went well', type: 'text', prompt: 'Hangi iş birliği anı en çok yardımcı oldu?', required: false },
  { id: 'q9', category: 'Improvement', type: 'singleChoice', prompt: 'Sürtünmeyi nerede azaltabiliriz?', options: ['Toplantılar', 'İncelemeler', 'Dağıtımlar', 'Devirler'], required: true },
  { id: 'q10', category: 'Team mood', type: 'rating', prompt: 'Çalışma tempomuz ne kadar sürdürülebilirdi?', options: ['1', '2', '3', '4', '5'], required: true },
  { id: 'q11', category: 'Appreciation', type: 'text', prompt: 'Hangi takım davranışını kutlamalıyız?', required: false },
  { id: 'q12', category: 'Challenges', type: 'text', prompt: 'Hangi süreç beklenenden daha uzun sürdü?', required: true },
  { id: 'q13', category: 'Next sprint', type: 'singleChoice', prompt: 'Bir sonraki sprintte en çok neyi korumalıyız?', options: ['Odaklanma zamanı', 'Kalite', 'Öğrenme', 'Takım bağı'], required: true },
  { id: 'q14', category: 'Went well', type: 'text', prompt: 'Bu sprintte kendine güvenmene ne yardımcı oldu?', required: false },
  { id: 'q15', category: 'Improvement', type: 'text', prompt: 'Hangi küçük deneyi denemeliyiz?', required: true },
];
