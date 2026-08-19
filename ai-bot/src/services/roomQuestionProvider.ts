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
    roomId: string,
    roomInstanceId: string,
    request: GenerateQuestionsRequest,
    options: { replaceExisting?: boolean; sourceType: "prompt" | "file"; signal?: AbortSignal },
  ): Promise<RoomQuestionSet> {
    const existing = this.store.getQuestionsForRoom(roomId, roomInstanceId);
    if (existing && !options.replaceExisting) return existing;

    const lease = this.store.beginGeneration(roomId, roomInstanceId, options.sourceType);
    try {
      const generated = await this.generator.generate(request, options.signal);
      return this.store.commitGeneration(lease, generated);
    } catch (error: unknown) {
      if (options.signal?.aborted) {
        this.tryFail(lease);
        throw new Error("Soru üretimi iptal edildi.");
      }
      if (existing) {
        this.tryFail(lease);
        throw error;
      }
      this.onFallback?.();
      try {
        const generated = await this.fallback.generate(request, options.signal);
        return this.store.commitGeneration(lease, generated);
      } catch (fallbackError: unknown) {
        this.tryFail(lease);
        throw fallbackError;
      }
    }
  }

  getQuestionsForRoom(roomId: string, roomInstanceId?: string): RoomQuestionSet | null {
    return this.store.getQuestionsForRoom(roomId, roomInstanceId);
  }

  getNextQuestion(roomId: string, gameType: string) {
    return this.store.getNextQuestion(roomId, gameType);
  }

  resetQuestionProgress(roomId: string, gameType: string): boolean {
    return this.store.resetQuestionProgress(roomId, gameType);
  }

  closeRoom(roomId: string, roomInstanceId?: string): boolean {
    return this.store.closeRoom(roomId, roomInstanceId);
  }

  private tryFail(lease: Parameters<RoomQuestionStore["commitGeneration"]>[0]): void {
    try { this.store.failGeneration(lease); }
    catch { /* A close/replacement already invalidated this generation. */ }
  }
}
