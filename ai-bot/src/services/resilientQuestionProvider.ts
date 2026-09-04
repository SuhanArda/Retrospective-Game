import { randomUUID } from "node:crypto";
import type { GenerateQuestionsRequest, GenerateQuestionsResponse, GeneratedQuestion } from "../types/questions.js";
import type { AiQuestionGenerationService } from "./questionProvider.js";
import {
  normalizeQuestionText,
  type QuestionBank,
  type QuestionBankLogger,
  type StoredQuestionRecord,
} from "./questionBank.js";

const fallbackAnswer = "Takımın ortak değerlendirmesine göre.";

export class PersistingQuestionGenerator implements AiQuestionGenerationService {
  constructor(
    private readonly generator: AiQuestionGenerationService,
    private readonly questionBank: QuestionBank,
    private readonly logger: QuestionBankLogger = console,
  ) {}

  async generate(request: GenerateQuestionsRequest, signal?: AbortSignal): Promise<GenerateQuestionsResponse> {
    const generated = await this.generator.generate(request, signal);
    if (generated.provider === "gemini") {
      try {
        await this.questionBank.saveGeneratedQuestions(request, generated.questions);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "unknown storage error";
        this.logger.warn(`[QuestionBank] generated questions returned but could not be stored: ${message}`);
      }
    }
    const source = generated.provider === "gemini" ? "gemini" : "local-fallback";
    this.logger.log(`[AI Request] completed source=${source} count=${generated.questions.length}`);
    return generated;
  }
}

export class QuestionBankFallbackGenerator implements AiQuestionGenerationService {
  constructor(
    private readonly questionBank: QuestionBank,
    private readonly localFallback: AiQuestionGenerationService,
    private readonly logger: QuestionBankLogger = console,
  ) {}

  async generate(request: GenerateQuestionsRequest, signal?: AbortSignal): Promise<GenerateQuestionsResponse> {
    this.logger.log("[QuestionBank] attempting saved fallback");
    let saved: readonly StoredQuestionRecord[] = [];
    try {
      saved = await this.questionBank.getFallbackQuestions(request, request.count);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "unknown storage error";
      this.logger.warn(`[QuestionBank] saved fallback unavailable: ${message}`);
    }

    const fromBank: GeneratedQuestion[] = saved.map((question) => ({
      id: randomUUID(),
      text: question.text,
      answer: fallbackAnswer,
      category: question.category,
      gameCategory: question.gameCategory,
    }));
    if (fromBank.length >= request.count) {
      this.logger.log(`[QuestionBank] Gemini unavailable, using ${request.count} saved questions`);
      this.logger.log(`[AI Request] completed source=question-bank count=${request.count}`);
      return response(fromBank.slice(0, request.count));
    }

    if (fromBank.length > 0) {
      this.logger.log(`[QuestionBank] only ${fromBank.length} saved questions available, supplementing local fallback`);
    } else {
      this.logger.log("[QuestionBank] no saved questions available, using local fallback");
    }
    const local = await this.localFallback.generate(request, signal);
    const questions = fillWithLocal(fromBank, local.questions, request.count);
    const source = fromBank.length > 0 ? "question-bank+local-fallback" : "local-fallback";
    this.logger.log(`[AI Request] completed source=${source} count=${questions.length} bankCount=${fromBank.length}`);
    return response(questions);
  }
}

function fillWithLocal(
  saved: readonly GeneratedQuestion[],
  local: readonly GeneratedQuestion[],
  count: number,
): GeneratedQuestion[] {
  const result = [...saved];
  const seen = new Set(result.map((question) => normalizeQuestionText(question.text)));
  const targetWork = Math.ceil(count / 2);
  const targetEntertainment = count - targetWork;
  let workCount = result.filter((question) => question.gameCategory === "work").length;
  let entertainmentCount = result.filter((question) => question.gameCategory === "entertainment").length;

  for (const question of local) {
    if (result.length >= count) break;
    const normalized = normalizeQuestionText(question.text);
    if (seen.has(normalized)) continue;
    if (question.gameCategory === "work" && workCount < targetWork) {
      result.push(question);
      workCount++;
      seen.add(normalized);
    } else if (question.gameCategory === "entertainment" && entertainmentCount < targetEntertainment) {
      result.push(question);
      entertainmentCount++;
      seen.add(normalized);
    }
  }
  for (const question of local) {
    if (result.length >= count) break;
    const normalized = normalizeQuestionText(question.text);
    if (seen.has(normalized)) continue;
    result.push(question);
    seen.add(normalized);
  }
  if (result.length !== count) throw new Error("Kayıtlı ve yerel soru bankalarında yeterli benzersiz soru yok.");
  return result;
}

function response(questions: GeneratedQuestion[]): GenerateQuestionsResponse {
  return { gameId: "room-retrospective", provider: "demo", questions };
}
