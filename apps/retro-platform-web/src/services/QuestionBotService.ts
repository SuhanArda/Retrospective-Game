export interface GeneratedQuestion {
  id: string;
  text: string;
  category: string;
  gameCategory?: "work" | "entertainment";
}

interface RoomQuestionSet {
  gameId: string;
  provider: "demo" | "gemini";
  questions: GeneratedQuestion[];
}

const questionApiUrl = typeof import.meta.env.VITE_API_URL === "string"
  && import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL
  : null;
const questionRequestTimeoutMs = 3_000;

function requireQuestionBotUrl(): string {
  if (!questionApiUrl) throw new Error("QUESTION_BOT_UNAVAILABLE");
  return questionApiUrl;
}

function authHeaders(playerId: string, reconnectToken: string): Record<string, string> {
  return { "X-Player-Id": playerId, "X-Reconnect-Token": reconnectToken };
}

async function encodeReportFile(file: File): Promise<{ name: string; mimeType: string; dataBase64: string }> {
  const dataBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("REPORT_READ_FAILED"));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const separator = result.indexOf(",");
      if (separator < 0) reject(new Error("REPORT_READ_FAILED"));
      else resolve(result.slice(separator + 1));
    };
    reader.readAsDataURL(file);
  });
  return { name: file.name, mimeType: file.type, dataBase64 };
}

async function requestQuestionApi(path: string, init?: RequestInit, timeoutMs = questionRequestTimeoutMs): Promise<Response> {
  return fetch(`${requireQuestionBotUrl()}${path}`, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(timeoutMs),
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
    return typeof item.id === "string" && typeof item.text === "string" && typeof item.category === "string"
      && (item.gameCategory === undefined || item.gameCategory === "work" || item.gameCategory === "entertainment");
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
  reportFile?: File | null;
  playerId: string;
  reconnectToken: string;
}): Promise<RoomQuestionSet> {
  const reportFile = input.reportFile ? await encodeReportFile(input.reportFile) : null;
  const response = await requestQuestionApi(`/api/rooms/${encodeURIComponent(input.roomCode)}/questions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(input.playerId, input.reconnectToken) },
    keepalive: reportFile === null,
    body: JSON.stringify({
      topic: input.contextPrompt?.trim() || null,
      reportText: input.reportText?.trim() || null,
      reportFile,
      language: "tr",
      style: input.style,
      count: 20,
    }),
  }, 45_000);
  if (!response.ok) throw new Error("QUESTION_PREPARATION_FAILED");
  return parseRoomQuestionSet(await response.json());
}

export async function roomQuestionsAreReady(roomCode: string, playerId: string, reconnectToken: string): Promise<boolean> {
  const response = await requestQuestionApi(`/api/rooms/${encodeURIComponent(roomCode)}/questions`, {
    headers: authHeaders(playerId, reconnectToken),
  });
  if (response.status === 404) return false;
  if (!response.ok) throw new Error("QUESTION_BOT_UNAVAILABLE");
  const result = parseRoomQuestionSet(await response.json());
  return result.questions.length === 20;
}
