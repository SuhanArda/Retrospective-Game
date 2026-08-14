import type { AppConfig } from "../config.js";
import type { GenerateQuestionsRequest, GenerateQuestionsResponse } from "../types/questions.js";
import { generateDemoQuestions } from "./demoQuestionGenerator.js";
import { generateQuestions } from "./questionGenerator.js";

export interface AiQuestionGenerationService {
  generate(request: GenerateQuestionsRequest, signal?: AbortSignal): Promise<GenerateQuestionsResponse>;
}

export class LocalPrivateQuestionGenerator implements AiQuestionGenerationService {
  async generate(request: GenerateQuestionsRequest, _signal?: AbortSignal): Promise<GenerateQuestionsResponse> {
    return generateDemoQuestions(request);
  }
}

export class GeminiQuestionGenerator implements AiQuestionGenerationService {
  constructor(private readonly config: AppConfig) {}

  async generate(request: GenerateQuestionsRequest, signal?: AbortSignal): Promise<GenerateQuestionsResponse> {
    if (!this.config.apiKey) throw new Error("Gemini sağlayıcısı yapılandırılmadı.");
    return generateQuestions(request, this.config.apiKey, this.config.model, {
      timeoutMs: this.config.requestTimeoutMs,
      maximumRetries: this.config.maximumRetries,
      ...(signal ? { signal } : {}),
    });
  }
}

export function createAiQuestionGenerationService(config: AppConfig): AiQuestionGenerationService {
  return config.questionProvider === "gemini"
    ? new GeminiQuestionGenerator(config)
    : new LocalPrivateQuestionGenerator();
}
