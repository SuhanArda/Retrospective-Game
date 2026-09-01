import { randomUUID } from "node:crypto";
import type { GenerateQuestionsRequest, GenerateQuestionsResponse, QuestionDraft } from "../types/questions.js";
import { buildGameQuestionPrompt, buildGameSystemInstruction } from "../prompts/gameQuestionPrompt.js";

export interface GeminiContentClient {
  generateContent(input: {
    model: string;
    contents: string;
    config: Record<string, unknown>;
  }): Promise<{ text: string | undefined }>;
}

const categories = ["reflection", "teamwork", "improvement", "fun"] as const;
const forbiddenLeakPattern = /(https?:\/\/|www\.|system prompt|sistem talimat|api anahtar|access[_ -]?key|secret|password|e-?posta|@\w+\.|\+?\d[\d\s()-]{8,})/iu;
const genericImposterAnswers = new Set([
  "takim", "ekip", "dayanisma", "lider", "liderlik", "iletisim", "is birligi", "basari", "motivasyon", "yaraticilik",
]);

function foldForComparison(value: string): string {
  return value.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/\p{M}/gu, "").replace(/ı/gu, "i");
}

function validateAnswersAgainstSource(request: GenerateQuestionsRequest, questions: readonly QuestionDraft[]): void {
  const source = foldForComparison(`${request.topic}\n${request.reportText ?? ""}`);
  const unrelatedGenericAnswer = questions.find((question) => {
    const answer = foldForComparison(question.answer);
    return genericImposterAnswers.has(answer) && !source.includes(answer);
  });
  if (unrelatedGenericAnswer) throw new Error("Gemini kaynakla ilgisiz genel bir gizli kelime üretti.");
}

function isUsableImposterWord(value: string): boolean {
  const parts = value.split(/\s+/u).filter(Boolean);
  return value.length <= 48 && parts.length >= 1 && parts.length <= 3 &&
    /^[\p{L}\p{N}]+(?:[ '-][\p{L}\p{N}]+)*$/u.test(value);
}

function cleanOptionalStrings(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length !== 4) return undefined;
  const options = value.map((option) => typeof option === "string" ? option.trim() : "");
  return options.every((option) => option.length > 0 && option.length <= 180) ? options : undefined;
}

function parseQuestionDraft(value: unknown): QuestionDraft | null {
  if (typeof value !== "object" || value === null) return null;
  const item = value as Record<string, unknown>;
  const text = typeof item.text === "string" ? item.text.trim() : "";
  const answer = typeof item.answer === "string" ? item.answer.trim() : "";
  const category = categories.find((candidate) => candidate === item.category);
  const gameCategory = item.gameCategory === "work" || item.gameCategory === "entertainment" ? item.gameCategory : null;
  const difficulty = item.difficulty === "easy" || item.difficulty === "medium" || item.difficulty === "hard"
    ? item.difficulty : undefined;
  if (text.length < 10 || text.length > 180 || !text.endsWith("?") || forbiddenLeakPattern.test(text)
      || answer.length < 1 || !isUsableImposterWord(answer) || forbiddenLeakPattern.test(answer) || !category || !gameCategory) return null;

  const options = cleanOptionalStrings(item.options);
  const hasOptions = item.options !== undefined;
  const correctOptionIndex = item.correctOptionIndex;
  if (hasOptions && (!options || !Number.isInteger(correctOptionIndex)
      || typeof correctOptionIndex !== "number" || correctOptionIndex < 0 || correctOptionIndex >= options.length)) return null;
  if (!hasOptions && correctOptionIndex !== undefined) return null;

  return {
    text,
    answer,
    category,
    gameCategory,
    ...(difficulty ? { difficulty } : {}),
    ...(options ? { options, correctOptionIndex: correctOptionIndex as number } : {}),
  };
}

export function parseQuestions(text: string): QuestionDraft[] {
  let parsed: unknown;
  try { parsed = JSON.parse(text); }
  catch { throw new Error("Gemini geçerli JSON döndürmedi."); }
  if (typeof parsed !== "object" || parsed === null) throw new Error("Geçersiz Gemini yanıtı.");
  const envelope = parsed as { sourceSufficient?: unknown; questions?: unknown };
  if (envelope.sourceSufficient !== true) throw new Error("Kaynak içerik soru üretmek için yetersiz.");
  if (!Array.isArray(envelope.questions) || envelope.questions.length !== 20) {
    throw new Error("Gemini tam olarak 20 soru üretmedi.");
  }
  const questions = envelope.questions.map(parseQuestionDraft);
  if (questions.some((question) => question === null)) throw new Error("Gemini soru şemasına uymadı.");
  const drafts = questions as QuestionDraft[];
  const normalized = drafts.map((question) => question.text.toLocaleLowerCase("tr-TR"));
  if (new Set(normalized).size !== drafts.length) throw new Error("Gemini tekrarlanan sorular üretti.");
  const normalizedAnswers = drafts.map((question) => question.answer.toLocaleLowerCase("tr-TR"));
  if (new Set(normalizedAnswers).size !== drafts.length) throw new Error("Gemini tekrarlanan gizli kelimeler üretti.");
  const workCount = drafts.filter((question) => question.gameCategory === "work" && question.category !== "fun").length;
  const funCount = drafts.filter((question) => question.gameCategory === "entertainment" && question.category === "fun").length;
  if (workCount !== 10 || funCount !== 10) throw new Error("Gemini kategori dağılımını sağlayamadı.");
  return drafts;
}

function statusOf(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

function isRetryable(error: unknown): boolean {
  const status = statusOf(error);
  return status === null || status === 408 || status === 429 || status >= 500;
}

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error("Soru üretimi iptal edildi.")); return; }
    const timeout = setTimeout(resolve, milliseconds);
    signal?.addEventListener("abort", () => {
      clearTimeout(timeout);
      reject(new Error("Soru üretimi iptal edildi."));
    }, { once: true });
  });
}

export async function generateQuestions(
  request: GenerateQuestionsRequest,
  client: GeminiContentClient,
  model: string,
  options: { timeoutMs?: number; maximumRetries?: number; signal?: AbortSignal } = {},
): Promise<GenerateQuestionsResponse> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const maximumRetries = options.maximumRetries ?? 2;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maximumRetries; attempt++) {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const abortSignal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal;
    try {
      const response = await client.generateContent({
        model,
        contents: buildGameQuestionPrompt(request),
        config: {
          abortSignal,
          systemInstruction: buildGameSystemInstruction(request),
          temperature: 0.55,
          responseMimeType: "application/json",
          responseJsonSchema: {
            type: "object",
            additionalProperties: false,
            required: ["sourceSufficient", "questions"],
            properties: {
              sourceSufficient: { type: "boolean" },
              questions: {
                type: "array", minItems: 0, maxItems: 20,
                items: {
                  type: "object", additionalProperties: false,
                  required: ["text", "answer", "category", "gameCategory"],
                  properties: {
                    text: { type: "string" },
                    answer: { type: "string", minLength: 2, maxLength: 48 },
                    category: { type: "string", enum: [...categories] },
                    gameCategory: { type: "string", enum: ["work", "entertainment"] },
                    options: { type: "array", minItems: 4, maxItems: 4, items: { type: "string" } },
                    correctOptionIndex: { type: "integer", minimum: 0, maximum: 3 },
                    difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
                  },
                },
              },
            },
          },
        },
      });
      if (!response.text) throw new Error("Gemini yanıtında soru çıktısı bulunamadı.");
      const questions = parseQuestions(response.text);
      validateAnswersAgainstSource(request, questions);
      return {
        gameId: "room-retrospective",
        provider: "gemini",
        questions: questions.map((question) => ({ id: randomUUID(), ...question })),
      };
    } catch (error: unknown) {
      if (options.signal?.aborted) throw new Error("Soru üretimi iptal edildi.");
      lastError = error instanceof Error ? error : new Error("Gemini isteği başarısız oldu.");
      if (attempt === maximumRetries || !isRetryable(error)) throw lastError;
      await delay(250 * 2 ** attempt, options.signal);
    }
  }
  throw lastError ?? new Error("Gemini isteği başarısız oldu.");
}
