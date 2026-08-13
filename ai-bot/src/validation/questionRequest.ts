import type { GenerateQuestionsRequest } from "../types/questions.js";

interface ValidationSuccess {
  success: true;
  data: GenerateQuestionsRequest;
}

interface ValidationFailure {
  success: false;
  errors: string[];
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return cleaned.length > 0 ? cleaned : null;
}

export function validateGenerateQuestionsRequest(value: unknown): ValidationResult {
  if (!isRecord(value)) {
    return { success: false, errors: ["İstek gövdesi bir JSON nesnesi olmalıdır."] };
  }

  const gameId = cleanString(value.gameId);
  const topic = cleanString(value.topic);
  const reportText = cleanString(value.reportText);
  const language = cleanString(value.language);
  const style = cleanString(value.style);
  const count = value.count;
  const errors: string[] = [];

  if (!gameId || gameId.length > 80) errors.push("gameId 1-80 karakter olmalıdır.");
  if (!topic && !reportText) errors.push("topic veya reportText alanlarından biri gereklidir.");
  if (topic && topic.length > 500) errors.push("topic en fazla 500 karakter olmalıdır.");
  if (reportText && reportText.length > 20_000) errors.push("reportText en fazla 20.000 karakter olmalıdır.");
  if (!language || language.length > 40) errors.push("language 1-40 karakter olmalıdır.");
  if (!style || !["dengeli", "eğlendirici", "düşündürücü"].includes(style)) errors.push("style geçerli bir soru kategorisi olmalıdır.");
  if (!Number.isInteger(count) || typeof count !== "number" || count < 1 || count > 30) {
    errors.push("count 1 ile 30 arasında bir tam sayı olmalıdır.");
  }

  if (errors.length > 0 || !gameId || (!topic && !reportText) || !language || !style || typeof count !== "number") {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      gameId,
      topic: topic ?? "Yüklenen retrospektif raporu",
      ...(reportText ? { reportText } : {}),
      language,
      style: style as GenerateQuestionsRequest["style"],
      count,
    },
  };
}

export function validateRoomQuestionRequest(value: unknown): ValidationResult {
  const result = validateGenerateQuestionsRequest(value);
  if (!result.success) return result;
  if (result.data.count !== 15) {
    return { success: false, errors: ["Oyun oturumu için count 15 olmalıdır."] };
  }
  return result;
}
