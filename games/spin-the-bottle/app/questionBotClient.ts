export interface BotQuestion {
  id: string;
  text: string;
  category: string;
  gameCategory?: "work" | "entertainment";
}

export async function loadRoomQuestions(baseUrl: string, roomCode: string): Promise<BotQuestion[]> {
  const response = await fetch(`${baseUrl}/rooms/${encodeURIComponent(roomCode)}/questions`);
  if (!response.ok) throw new Error("ROOM_QUESTIONS_UNAVAILABLE");
  const result = await response.json() as { questions?: unknown };
  if (!Array.isArray(result.questions)) throw new Error("INVALID_ROOM_QUESTIONS");
  return result.questions.filter((question): question is BotQuestion => {
    if (typeof question !== "object" || question === null) return false;
    const item = question as Record<string, unknown>;
    return typeof item.id === "string" && typeof item.text === "string" && typeof item.category === "string"
      && (item.gameCategory === undefined || item.gameCategory === "work" || item.gameCategory === "entertainment");
  });
}

export async function deleteRoomQuestions(baseUrl: string, roomCode: string): Promise<void> {
  await fetch(`${baseUrl}/rooms/${encodeURIComponent(roomCode)}`, { method: "DELETE" });
}
