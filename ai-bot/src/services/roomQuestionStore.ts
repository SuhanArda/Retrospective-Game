import { randomUUID } from "node:crypto";
import type { GenerateQuestionsResponse, RoomQuestionSet } from "../types/questions.js";

interface StoredQuestionSet {
  value: RoomQuestionSet;
  timeout: ReturnType<typeof setTimeout>;
  progressByGame: Map<string, number>;
}

export class RoomQuestionStore {
  private readonly rooms = new Map<string, StoredQuestionSet>();

  constructor(private readonly ttlMs: number) {}

  set(roomCode: string, generated: GenerateQuestionsResponse): RoomQuestionSet {
    this.delete(roomCode);
    const createdAt = Date.now();
    const value: RoomQuestionSet = {
      ...generated,
      roomCode,
      questionSetId: randomUUID(),
      status: "ready",
      currentQuestionIndex: 0,
      createdAt,
      expiresAt: createdAt + this.ttlMs,
    };
    const timeout = setTimeout(() => this.delete(roomCode), this.ttlMs);
    timeout.unref();
    this.rooms.set(roomCode, { value, timeout, progressByGame: new Map() });
    return value;
  }

  getQuestionsForRoom(roomCode: string): RoomQuestionSet | null {
    return this.rooms.get(roomCode)?.value ?? null;
  }

  hasAiQuestions(roomCode: string): boolean {
    return (this.rooms.get(roomCode)?.value.questions.length ?? 0) > 0;
  }

  getNextQuestion(roomCode: string, gameType: string) {
    const stored = this.rooms.get(roomCode);
    if (!stored || stored.value.questions.length === 0) return null;
    const index = stored.progressByGame.get(gameType) ?? 0;
    stored.progressByGame.set(gameType, index + 1);
    stored.value.currentQuestionIndex = index + 1;
    return stored.value.questions[index % stored.value.questions.length] ?? null;
  }

  resetQuestionProgress(roomCode: string, gameType: string): boolean {
    const stored = this.rooms.get(roomCode);
    if (!stored) return false;
    stored.progressByGame.delete(gameType);
    stored.value.currentQuestionIndex = 0;
    return true;
  }

  delete(roomCode: string): boolean {
    const stored = this.rooms.get(roomCode);
    if (!stored) return false;
    clearTimeout(stored.timeout);
    return this.rooms.delete(roomCode);
  }

  get size(): number {
    return this.rooms.size;
  }
}
