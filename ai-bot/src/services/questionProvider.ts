import { GoogleGenAI } from "@google/genai";
import type { AppConfig } from "../config.js";
import type { GenerateQuestionsRequest, GenerateQuestionsResponse } from "../types/questions.js";
import { generateDemoQuestions } from "./demoQuestionGenerator.js";
import { generateQuestions, type GeminiContentClient } from "./questionGenerator.js";

export interface AiQuestionGenerationService {
  generate(request: GenerateQuestionsRequest, signal?: AbortSignal): Promise<GenerateQuestionsResponse>;
}

export class LocalPrivateQuestionGenerator implements AiQuestionGenerationService {
  async generate(request: GenerateQuestionsRequest, _signal?: AbortSignal): Promise<GenerateQuestionsResponse> {
    return generateDemoQuestions(request);
  }
}

export class GeminiQuestionGenerator implements AiQuestionGenerationService {
  private readonly client: GeminiContentClient;

  constructor(private readonly config: AppConfig) {
    if (!config.apiKey) throw new Error("Gemini sağlayıcısı yapılandırılmadı.");
    const sdk = new GoogleGenAI({ apiKey: config.apiKey });
    this.client = { generateContent: (input) => sdk.models.generateContent(input) };
  }

  generate(request: GenerateQuestionsRequest, signal?: AbortSignal): Promise<GenerateQuestionsResponse> {
    return generateQuestions(request, this.client, this.config.model, {
      timeoutMs: this.config.requestTimeoutMs,
      maximumRetries: this.config.maximumRetries,
      ...(signal ? { signal } : {}),
    });
  }
}

export function createAiQuestionGenerationService(config: AppConfig): AiQuestionGenerationService {
  return config.questionProvider === "gemini" ? new GeminiQuestionGenerator(config) : new LocalPrivateQuestionGenerator();
}
