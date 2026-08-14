import { randomUUID } from "node:crypto";
import { getGameProfile } from "../data/gameProfiles.js";
import { buildGameQuestionPrompt, buildGameSystemInstruction } from "../prompts/gameQuestionPrompt.js";
import type { GenerateQuestionsRequest, GenerateQuestionsResponse, QuestionDraft } from "../types/questions.js";

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  error?: { message?: string };
}

const forbiddenLeakPattern = /(https?:\/\/|www\.|system prompt|sistem talimat|api anahtar|access[_ -]?key|secret|password|e-?posta|@\w+\.|\+?\d[\d\s()-]{8,})/iu;

function repeatsLongSourceExcerpt(text: string, request: GenerateQuestionsRequest): boolean {
  const normalize = (value: string) => value.toLocaleLowerCase("tr-TR").replace(/\s+/gu, " ").trim();
  const question = normalize(text).replace(/\?$/u, "");
  if (question.length < 60) return false;
  const source = normalize(`${request.topic}\n${request.reportText ?? ""}`);
  return source.includes(question.slice(0, 60));
}

function isQuestionDraft(value: unknown, request: GenerateQuestionsRequest): value is QuestionDraft {
  const profile = getGameProfile(request.gameId);
  if (!profile || typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  const text = typeof item.text === "string" ? item.text.trim() : "";
  return text.length >= profile.minimumTextLength
    && text.length <= profile.maximumTextLength
    && text.endsWith("?")
    && !forbiddenLeakPattern.test(text)
    && !repeatsLongSourceExcerpt(text, request)
    && typeof item.category === "string"
    && profile.categories.includes(item.category)
    && (item.gameCategory === "work" || item.gameCategory === "entertainment");
}

export function parseQuestions(payload: GeminiResponse, request: GenerateQuestionsRequest): QuestionDraft[] {
  const profile = getGameProfile(request.gameId);
  if (!profile) throw new Error("Desteklenmeyen oyun kimliği.");
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("");
  if (!text) throw new Error("Gemini yanıtında soru çıktısı bulunamadı.");
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== "object" || parsed === null) throw new Error("Geçersiz Gemini yanıtı.");
  const envelope = parsed as { sourceSufficient?: unknown; questions?: unknown };
  if (envelope.sourceSufficient !== true) throw new Error("Kaynak içerik soru üretmek için yetersiz.");
  const questions = envelope.questions;
  if (!Array.isArray(questions) || questions.length !== profile.questionCount
    || !questions.every((question) => isQuestionDraft(question, request))) {
    throw new Error("Gemini oyun profiline uygun soru üretmedi.");
  }
  const normalized = questions.map((question) => question.text.trim().toLocaleLowerCase("tr-TR"));
  if (new Set(normalized).size !== questions.length) throw new Error("Gemini tekrarlanan sorular üretti.");
  if (profile.distribution) {
    const work = questions.filter((question) => question.gameCategory === "work" && question.category !== "fun").length;
    const fun = questions.filter((question) => question.gameCategory === "entertainment" && question.category === "fun").length;
    if (work !== profile.distribution.work || fun !== profile.distribution.entertainment)
      throw new Error("Gemini kategori dağılımını sağlayamadı.");
  } else if (questions.some((question) => question.gameCategory !== "work")) {
    throw new Error("Gemini oyun profiline uygun kategori üretmedi.");
  }
  return questions;
}

function retryable(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

export async function generateQuestions(
  request: GenerateQuestionsRequest,
  apiKey: string,
  model: string,
  options: { timeoutMs?: number; maximumRetries?: number; signal?: AbortSignal } = {},
): Promise<GenerateQuestionsResponse> {
  const profile = getGameProfile(request.gameId);
  if (!profile) throw new Error("Desteklenmeyen oyun kimliği.");
  const timeoutMs = options.timeoutMs ?? 30_000;
  const maximumRetries = options.maximumRetries ?? 2;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maximumRetries; attempt++) {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal;
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: buildGameSystemInstruction(request) }] },
            contents: [{ role: "user", parts: [{ text: buildGameQuestionPrompt(request) }] }],
            generationConfig: {
              responseMimeType: "application/json",
              responseJsonSchema: {
                type: "object",
                properties: {
                  sourceSufficient: { type: "boolean" },
                  questions: {
                    type: "array", minItems: 0, maxItems: profile.questionCount,
                    items: {
                      type: "object",
                      properties: {
                        text: { type: "string" },
                        category: { type: "string", enum: [...profile.categories] },
                        gameCategory: { type: "string", enum: ["work", "entertainment"] },
                      },
                      required: ["text", "category", "gameCategory"], additionalProperties: false,
                    },
                  },
                },
                required: ["sourceSufficient", "questions"], additionalProperties: false,
              },
            },
          }),
          signal,
        },
      );
      const payload = await response.json() as GeminiResponse;
      if (!response.ok) {
        const error = new Error(`Gemini isteği başarısız oldu (${response.status}).`);
        if (!retryable(response.status) || attempt === maximumRetries) throw error;
        lastError = error;
      } else {
        return {
          gameId: profile.id, provider: "gemini",
          questions: parseQuestions(payload, request).map((question) => ({ ...question, text: question.text.trim(), id: randomUUID() })),
        };
      }
    } catch (error: unknown) {
      if (options.signal?.aborted) throw new Error("Soru üretimi iptal edildi.");
      lastError = error instanceof Error ? error : new Error("Gemini isteği başarısız oldu.");
      if (attempt === maximumRetries) throw lastError;
    }
    await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
  }
  throw lastError ?? new Error("Gemini isteği başarısız oldu.");
}
