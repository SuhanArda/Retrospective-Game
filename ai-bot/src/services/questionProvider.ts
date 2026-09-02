import { GoogleGenAI } from "@google/genai";
import type { AppConfig } from "../config.js";
import type { GenerateQuestionsRequest, GenerateQuestionsResponse } from "../types/questions.js";
import { generateDemoQuestions } from "./demoQuestionGenerator.js";
import { describeGeminiFailure, generateQuestions, type GeminiContentClient } from "./questionGenerator.js";

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

  async generate(request: GenerateQuestionsRequest, signal?: AbortSignal): Promise<GenerateQuestionsResponse> {
    console.log(`[AI] Gemini generation started model=${this.config.model}`);
    try {
      const generated = await generateQuestions(request, this.client, this.config.model, {
        timeoutMs: this.config.requestTimeoutMs,
        maximumRetries: this.config.maximumRetries,
        logger: console,
        ...(signal ? { signal } : {}),
      });
      console.log(`[AI] Gemini generation succeeded count=${generated.questions.length}`);
      return generated;
    } catch (error: unknown) {
      const failure = describeGeminiFailure(error);
      console.warn(`[AI] Gemini generation failed status=${failure.status ?? "none"} reason=${failure.reason}`);
      throw error;
    }
  }
}

export function createAiQuestionGenerationService(config: AppConfig): AiQuestionGenerationService {
  return config.questionProvider === "gemini" ? new GeminiQuestionGenerator(config) : new LocalPrivateQuestionGenerator();
}
