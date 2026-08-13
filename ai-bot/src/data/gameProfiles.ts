export interface GameProfile {
  name: string;
  mechanic: string;
  categories: readonly string[];
}

const profiles: Readonly<Record<string, GameProfile>> = {
  "spin-the-bottle": {
    name: "Spin the Bottle",
    mechanic: "Şişenin seçtiği oyuncu ekiple konuşmayı başlatan tek bir soruyu yanıtlar.",
    categories: ["work", "fun"],
  },
  "retro-rush": {
    name: "Retro Rush",
    mechanic: "Oyuncular oyun akışını kesmeyecek kısa retrospektif soruları yanıtlar.",
    categories: ["reflection", "teamwork", "improvement"],
  },
};

const genericProfile: GameProfile = {
  name: "Genel retrospektif oyunu",
  mechanic: "Sorular ekip üyelerinin deneyimlerini paylaşmasını ve iyileştirme fikirleri üretmesini sağlar.",
  categories: ["reflection", "teamwork", "improvement", "fun"],
};

export function getGameProfile(gameId: string): GameProfile {
  return profiles[gameId] ?? genericProfile;
}

