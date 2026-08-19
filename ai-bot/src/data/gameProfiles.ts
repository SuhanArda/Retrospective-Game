export interface GameProfile {
  id: "room-retrospective";
  name: string;
  mechanic: string;
  categories: readonly ["reflection", "teamwork", "improvement", "fun"];
  questionCount: 20;
  minimumTextLength: number;
  maximumTextLength: number;
  distribution: Readonly<Record<"work" | "entertainment", number>>;
  rules: readonly string[];
}

export const ROOM_QUESTION_PROFILE_ID = "room-retrospective" as const;

const roomProfile: GameProfile = {
  id: ROOM_QUESTION_PROFILE_ID,
  name: "Ortak Oda Retrospektifi",
  mechanic: "Tek doğrulanmış soru paketi odadaki mevcut ve gelecekteki tüm oyunlar tarafından kullanılır.",
  categories: ["reflection", "teamwork", "improvement", "fun"],
  questionCount: 20,
  minimumTextLength: 10,
  maximumTextLength: 180,
  distribution: { work: 10, entertainment: 10 },
  rules: [
    "Sorular kısa, tek fikirli ve takım retrospektifine uygun olmalıdır.",
    "İş soruları kaynak temayı yapıcı bir retrospektif bakışla ele almalıdır.",
    "Eğlence soruları aynı kaynak temayı profesyonel ortama uygun yaratıcı bir açıyla ele almalıdır.",
    "Her soru, bütün oyunların kullanabileceği kısa ve net bir örnek cevaba sahip olmalıdır.",
  ],
};

/** Generation deliberately has one room profile; game ids never gate AI support. */
export function getGameProfile(_profileId?: string): GameProfile {
  return roomProfile;
}

export function normalizeGameId(_gameId: string): typeof ROOM_QUESTION_PROFILE_ID {
  return ROOM_QUESTION_PROFILE_ID;
}
