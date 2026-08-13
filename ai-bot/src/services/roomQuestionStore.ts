import { randomUUID } from "node:crypto";
import type { GenerateQuestionsResponse, RoomQuestionSet } from "../types/questions.js";

interface StoredQuestionSet {
  value: RoomQuestionSet;
  timeout: ReturnType<typeof setTimeout>;
}

export class RoomQuestionStore {
  private readonly sets = new Map<string, StoredQuestionSet>();

  constructor(private readonly ttlMs: number) {}

  set(roomCode: string, generated: GenerateQuestionsResponse): RoomQuestionSet {
    this.delete(roomCode);
    const createdAt = Date.now();
    const value: RoomQuestionSet = {
      ...generated,
      roomCode,
      questionSetId: randomUUID(),
      createdAt,
      expiresAt: createdAt + this.ttlMs,
    };
    const timeout = setTimeout(() => this.delete(roomCode), this.ttlMs);
    timeout.unref();
    this.sets.set(roomCode, { value, timeout });
    return value;
  }

  get(roomCode: string): RoomQuestionSet | null {
    return this.sets.get(roomCode)?.value ?? null;
  }

  delete(roomCode: string): boolean {
    const stored = this.sets.get(roomCode);
    if (!stored) return false;
    clearTimeout(stored.timeout);
    return this.sets.delete(roomCode);
  }

  get size(): number {
    return this.sets.size;
  }
}
