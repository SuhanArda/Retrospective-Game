export interface GeneratedQuestion {
  id: string;
  text: string;
  category: string;
}

interface RoomQuestionSet {
  gameId: string;
  provider: "demo" | "gemini";
  questions: GeneratedQuestion[];
}

const questionBotUrl = typeof import.meta.env.VITE_AI_BOT_URL === "string"
  && import.meta.env.VITE_AI_BOT_URL
  ? import.meta.env.VITE_AI_BOT_URL
  : null;
const questionRequestTimeoutMs = 3_000;

function requireQuestionBotUrl(): string {
  if (!questionBotUrl) throw new Error("QUESTION_BOT_UNAVAILABLE");
  return questionBotUrl;
}

async function requestQuestionBot(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${requireQuestionBotUrl()}${path}`, {
    ...init,
    signal: AbortSignal.timeout(questionRequestTimeoutMs),
  });
}

function parseRoomQuestionSet(value: unknown): RoomQuestionSet {
  if (typeof value !== "object" || value === null) throw new Error("INVALID_ROOM_QUESTIONS");
  const result = value as Record<string, unknown>;
  if ((result.provider !== "demo" && result.provider !== "gemini") || typeof result.gameId !== "string"
      || !Array.isArray(result.questions)) throw new Error("INVALID_ROOM_QUESTIONS");
  const questions = result.questions.filter((question): question is GeneratedQuestion => {
    if (typeof question !== "object" || question === null) return false;
    const item = question as Record<string, unknown>;
    return typeof item.id === "string" && typeof item.text === "string" && typeof item.category === "string";
  });
  if (questions.length !== result.questions.length) throw new Error("INVALID_ROOM_QUESTIONS");
  return { gameId: result.gameId, provider: result.provider, questions };
}

export async function prepareRoomQuestions(input: {
  roomCode: string;
  gameId: string;
  style: "dengeli" | "eğlendirici" | "düşündürücü";
  contextPrompt?: string;
  reportText?: string;
}): Promise<RoomQuestionSet> {
  const response = await requestQuestionBot(`/rooms/${encodeURIComponent(input.roomCode)}/questions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    body: JSON.stringify({
      gameId: input.gameId,
      topic: "genel retrospektif",
      ...((input.contextPrompt?.trim() || input.reportText?.trim()) ? {
        reportText: [
          input.contextPrompt?.trim() ? `Moderatör notu: ${input.contextPrompt.trim()}` : "",
          input.reportText?.trim() ? `Rapor içeriği: ${input.reportText.trim()}` : "",
        ].filter(Boolean).join("\n\n"),
      } : {}),
      language: "tr",
      style: input.style,
      count: 15,
    }),
  });
  if (!response.ok) throw new Error("QUESTION_PREPARATION_FAILED");
  return parseRoomQuestionSet(await response.json());
}

export async function roomQuestionsAreReady(roomCode: string, gameId: string): Promise<boolean> {
  const response = await requestQuestionBot(`/rooms/${encodeURIComponent(roomCode)}/questions`);
  if (response.status === 404) return false;
  if (!response.ok) throw new Error("QUESTION_BOT_UNAVAILABLE");
  const result = parseRoomQuestionSet(await response.json());
  return result.gameId === gameId && result.questions.length >= 15;
}
