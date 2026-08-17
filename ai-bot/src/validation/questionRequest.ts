import { ROOM_QUESTION_PROFILE_ID } from "../data/gameProfiles.js";
import type { GenerateQuestionsRequest, QuestionStyle } from "../types/questions.js";

interface ValidationSuccess { success: true; data: GenerateQuestionsRequest }
interface ValidationFailure { success: false; errors: string[] }
export type ValidationResult = ValidationSuccess | ValidationFailure;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return cleaned.length > 0 ? cleaned : null;
}

const styles: readonly QuestionStyle[] = ["dengeli", "eğlendirici", "düşündürücü"];

/** Room generation intentionally ignores a supplied gameId. */
export function validateGenerateQuestionsRequest(value: unknown): ValidationResult {
  if (!isRecord(value)) return { success: false, errors: ["İstek gövdesi bir JSON nesnesi olmalıdır."] };

  const topic = cleanString(value.topic);
  const reportText = cleanString(value.reportText);
  const language = cleanString(value.language);
  const style = cleanString(value.style);
  const count = value.count;
  const errors: string[] = [];

  if (!topic && !reportText) errors.push("topic veya reportText alanlarından biri gereklidir.");
  if (topic && topic.length > 500) errors.push("topic en fazla 500 karakter olmalıdır.");
  if (reportText && reportText.length > 20_000) errors.push("reportText en fazla 20.000 karakter olmalıdır.");
  if (!language || language.length > 40) errors.push("language 1-40 karakter olmalıdır.");
  if (!style || !styles.includes(style as QuestionStyle)) errors.push("style geçerli bir soru kategorisi olmalıdır.");
  if (count !== 20) errors.push("Oda soru paketi için count tam olarak 20 olmalıdır.");

  if (errors.length > 0 || (!topic && !reportText) || !language || !style || count !== 20) {
    return { success: false, errors };
  }
  return {
    success: true,
    data: {
      gameId: ROOM_QUESTION_PROFILE_ID,
      topic: topic ?? "Yüklenen retrospektif raporu",
      ...(reportText ? { reportText } : {}),
      language,
      style: style as QuestionStyle,
      count: 20,
    },
  };
}

export const validateRoomQuestionRequest = validateGenerateQuestionsRequest;

export function validateRoomEnvelope(value: unknown): { success: true; roomInstanceId: string; replaceExisting: boolean } | ValidationFailure {
  if (!isRecord(value)) return { success: false, errors: ["İstek gövdesi bir JSON nesnesi olmalıdır."] };
  const roomInstanceId = cleanString(value.roomInstanceId);
  if (!roomInstanceId || roomInstanceId.length > 80) {
    return { success: false, errors: ["roomInstanceId 1-80 karakter olmalıdır."] };
  }
  return { success: true, roomInstanceId, replaceExisting: value.replaceExisting === true };
}
