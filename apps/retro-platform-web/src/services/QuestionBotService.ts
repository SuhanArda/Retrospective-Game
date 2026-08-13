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

function requireQuestionBotUrl(): string {
  if (!questionBotUrl) throw new Error("QUESTION_BOT_UNAVAILABLE");
  return questionBotUrl;
}

export async function prepareRoomQuestions(input: {
  roomCode: string;
  gameId: string;
  style: "dengeli" | "eğlendirici" | "düşündürücü";
  contextPrompt?: string;
  reportText?: string;
}): Promise<RoomQuestionSet> {
  const response = await fetch(`${requireQuestionBotUrl()}/rooms/${encodeURIComponent(input.roomCode)}/questions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
  return response.json() as Promise<RoomQuestionSet>;
}

export async function roomQuestionsAreReady(roomCode: string, gameId: string): Promise<boolean> {
  const response = await fetch(`${requireQuestionBotUrl()}/rooms/${encodeURIComponent(roomCode)}/questions`);
  if (response.status === 404) return false;
  if (!response.ok) throw new Error("QUESTION_BOT_UNAVAILABLE");
  const result = await response.json() as RoomQuestionSet;
  return result.gameId === gameId && result.questions.length >= 15;
}
