import type { RoomQuestion } from "./spinTheBottleQuestionAdapter";

export type BotQuestion = RoomQuestion;

function authHeaders(playerId: string, reconnectToken: string): Record<string, string> {
  return { "X-Player-Id": playerId, "X-Reconnect-Token": reconnectToken };
}

export async function loadRoomQuestions(baseUrl: string, roomCode: string, playerId: string, reconnectToken: string): Promise<BotQuestion[]> {
  const response = await fetch(`${baseUrl}/api/rooms/${encodeURIComponent(roomCode)}/questions`, { headers: authHeaders(playerId, reconnectToken) });
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
