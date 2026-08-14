export interface GameProfile {
  id: string;
  name: string;
  mechanic: string;
  categories: readonly string[];
  questionCount: number;
  minimumTextLength: number;
  maximumTextLength: number;
  answerMode: "spoken" | "short-spoken";
  distribution?: Readonly<Record<"work" | "entertainment", number>>;
  rules: readonly string[];
}

export const ROOM_QUESTION_PROFILE_ID = "room-retrospective";

const profiles: Readonly<Record<string, GameProfile>> = {
  [ROOM_QUESTION_PROFILE_ID]: {
    id: ROOM_QUESTION_PROFILE_ID, name: "Ortak Oda Retrospektifi",
    mechanic: "Aynı doğrulanmış soru paketi odadaki tüm AI destekli oyunlar tarafından kullanılır.",
    categories: ["reflection", "teamwork", "improvement", "fun"], questionCount: 20,
    minimumTextLength: 10, maximumTextLength: 180, answerMode: "short-spoken",
    distribution: { work: 10, entertainment: 10 },
    rules: [
      "İş soruları kaynak temayı yapıcı bir retrospektif bakışla ele almalıdır.",
      "Eğlence soruları aynı kaynak temayı profesyonel ortama uygun benzetme, hayali senaryo veya hafif ekip etkileşimiyle ele almalıdır.",
      "Eğlence sorularında category=fun; diğer sorularda reflection, teamwork veya improvement kullan.",
      "Sorular hem Spin the Bottle içinde sözlü yanıtlanabilecek hem de Retro Rush akışını uzun süre kesmeyecek kadar kısa olmalıdır.",
    ],
  },
  "spin-the-bottle": {
    id: "spin-the-bottle", name: "Spin the Bottle",
    mechanic: "Şişenin seçtiği oyuncu tek bir soruyu ekiple sözlü yanıtlar.",
    categories: ["work", "fun"], questionCount: 30,
    minimumTextLength: 10, maximumTextLength: 220, answerMode: "spoken",
    distribution: { work: 15, entertainment: 15 },
    rules: [
      "İş sorularının her biri kaynak prompt veya raporun ana temasına açıkça dayanmalı; tarafsız ve yapıcı retrospektif sorular olmalıdır.",
      "Eğlence sorularının her biri de kaynak prompt veya raporun ana temasına açıkça bağlı, profesyonel ortama uygun buz kırıcı sorular olmalıdır.",
      "Kaynak temadan bağımsız genel tatil, film, çocukluk, yemek veya kişisel tercih soruları üretme.",
      "Eğlence soruları iş sorularını farklı kelimelerle tekrar etmemeli; aynı temayı yaratıcı benzetme, hayali senaryo veya hafif ekip etkileşimiyle ele almalıdır.",
    ],
  },
  "retro-rush": {
    id: "retro-rush", name: "Retro Rush",
    mechanic: "Oyuncu elendiğinde oyun akışını uzun süre kesmeyecek tek bir retrospektif soruyu sözlü yanıtlar.",
    categories: ["reflection", "teamwork", "improvement"], questionCount: 20,
    minimumTextLength: 10, maximumTextLength: 180, answerMode: "short-spoken",
    rules: ["Sorular kısa, tek fikirli ve doğrudan ekip retrospektifine uygun olmalıdır."],
  },
};

const aliases: Readonly<Record<string, string>> = {
  spin_the_bottle: "spin-the-bottle",
  retro_rush: "retro-rush",
};

export function normalizeGameId(gameId: string): string {
  const normalized = gameId.trim().toLocaleLowerCase("en-US");
  return aliases[normalized] ?? normalized;
}

export function getGameProfile(gameId: string): GameProfile | null {
  return profiles[normalizeGameId(gameId)] ?? null;
}

export function isSupportedRoomGame(gameId: string): boolean {
  const normalized = normalizeGameId(gameId);
  return normalized === "spin-the-bottle" || normalized === "retro-rush";
}
