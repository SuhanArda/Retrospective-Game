import type { GenerateQuestionsRequest, RoomQuestionSet } from "../types/questions.js";
import type { AiQuestionGenerationService } from "./questionProvider.js";
import { RoomQuestionStore } from "./roomQuestionStore.js";

export class RoomQuestionProvider {
  constructor(
    private readonly store: RoomQuestionStore,
    private readonly generator: AiQuestionGenerationService,
    private readonly fallback: AiQuestionGenerationService,
    private readonly onFallback?: () => void,
  ) {}

  async prepareQuestionsForRoom(
    roomCode: string,
    request: GenerateQuestionsRequest,
    signal?: AbortSignal,
  ): Promise<RoomQuestionSet> {
    const existing = this.store.getQuestionsForRoom(roomCode);
    if (existing) return existing;
    try {
      return this.store.set(roomCode, await this.generator.generate(request, signal));
    } catch {
      if (signal?.aborted) throw new Error("Soru üretimi iptal edildi.");
      this.onFallback?.();
      return this.store.set(roomCode, await this.fallback.generate(request, signal));
    }
  }

  getQuestionsForRoom(roomCode: string): RoomQuestionSet | null {
    return this.store.getQuestionsForRoom(roomCode);
  }

  hasAiQuestions(roomCode: string): boolean {
    return this.store.hasAiQuestions(roomCode);
  }

  getNextQuestion(roomCode: string, gameType: string) {
    return this.store.getNextQuestion(roomCode, gameType);
  }

  resetQuestionProgress(roomCode: string, gameType: string): boolean {
    return this.store.resetQuestionProgress(roomCode, gameType);
  }

  deleteRoom(roomCode: string): boolean {
    return this.store.delete(roomCode);
  }
}
