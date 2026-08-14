import type {
  ConnectionStatus,
  MatchState,
  PlayerState,
  RetroQuestionCategory,
} from '../domain/types';

export const matchStateLabels: Readonly<Record<MatchState, string>> = {
  LOADING: 'YÜKLENİYOR',
  WAITING: 'BEKLENİYOR',
  COUNTDOWN: 'GERİ SAYIM',
  RUNNING: 'DEVAM EDİYOR',
  FINISHED: 'TAMAMLANDI',
  ERROR: 'HATA',
};

export const playerStateLabels: Readonly<Record<PlayerState, string>> = {
  ACTIVE: 'AKTİF',
  FALLEN: 'DÜŞTÜ',
  ANSWERING_QUESTION: 'SORUYU CEVAPLIYOR',
  RESPAWNING: 'YENİDEN BAŞLIYOR',
  INVULNERABLE: 'KORUMALI',
  FINISHED: 'TAMAMLADI',
  DISCONNECTED: 'BAĞLANTI KESİLDİ',
};

export const connectionStatusLabels: Readonly<Record<ConnectionStatus, string>> = {
  disconnected: 'BAĞLANTI KESİLDİ',
  connecting: 'BAĞLANIYOR',
  connected: 'BAĞLANDI',
  reconnecting: 'YENİDEN BAĞLANIYOR',
};

export const retroQuestionCategoryLabels: Readonly<Record<RetroQuestionCategory, string>> = {
  'Went well': 'İYİ GİDENLER',
  Challenges: 'ZORLUKLAR',
  Improvement: 'İYİLEŞTİRME',
  Appreciation: 'TAKDİR',
  'Next sprint': 'SONRAKİ SPRİNT',
  'Team mood': 'TAKIMIN HALİ',
};

export function localizeUserError(message: string): string {
  const knownErrors: Readonly<Record<string, string>> = {
    ROOM_CONNECTION_NOT_READY: 'Oda bağlantısı henüz hazır değil.',
    WRONG_GAME_SESSION: 'Bu oyun oturumu artık geçerli değil.',
    WRONG_ROUND: 'Bu tur artık geçerli değil.',
    PLAYER_NOT_IN_SESSION: 'Oyuncu bu oyun oturumunda değil.',
    PLAYER_NOT_ACTIVE: 'Oyuncu şu anda bu işlemi yapamaz.',
    SHOVE_COOLDOWN: 'İtme yeteneği henüz hazır değil.',
    SHOVE_OUT_OF_RANGE: 'İtme hedefi menzil dışında.',
    HOST_REQUIRED: 'Bu işlemi yalnızca oda yöneticisi yapabilir.',
  };

  return knownErrors[message] ?? 'Bağlantı işlemi tamamlanamadı. Lütfen tekrar deneyin.';
}
