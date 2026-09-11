import type { MatchState } from '../domain/types';

export function shouldShowStandaloneStart(hasLaunchContext: boolean, state: MatchState): boolean {
  return !hasLaunchContext && state === 'WAITING';
}

/**
 * Lobi, oyuncunun kimliğini URL yerine tek kullanımlık `window.name` zarfıyla
 * taşır; URL'de yalnızca oda kodu, oyun ve oturum kimliği bulunur. Zarf yolda
 * kaybolduğunda (gizlilik ayarı onu silen tarayıcılar, elden ele paylaşılan
 * oyun linki) geriye sadece o oda kodu kalır. Böyle bir açılış sessizce tek
 * kişilik moda düşerse oyuncu odadakilerden habersiz botlarla oynar — bunun
 * yerine oda kodunu döndürüp onu lobiye geri gönderiyoruz.
 */
export function roomLaunchMissingCredentials(hasLaunchContext: boolean, search: string): string | null {
  if (hasLaunchContext) return null;
  const roomCode = new URLSearchParams(search).get('roomCode')?.trim().toUpperCase() ?? '';
  return /^[A-Z0-9]{6}$/.test(roomCode) ? roomCode : null;
}
