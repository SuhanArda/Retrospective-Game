import { randomUUID } from "node:crypto";
import type {
  GenerateQuestionsResponse,
  GeneratedQuestion,
  RoomAIState,
  RoomQuestionSet,
} from "../types/questions.js";

export class RoomGenerationInProgressError extends Error {}
export class StaleRoomGenerationError extends Error {}

interface GenerationLease {
  roomId: string;
  roomInstanceId: string;
  generationToken: string;
}

function publicValue(state: RoomAIState): RoomQuestionSet {
  const { generationToken: _token, gameProgress: _progress, ...value } = state;
  return structuredClone({
    ...value,
    generationStatus: value.questions.length > 0 ? "ready" : value.generationStatus,
  });
}

/** Process-local, room-owned question storage. No game id is used as a key. */
export class RoomQuestionStore {
  private readonly rooms = new Map<string, RoomAIState>();

  beginGeneration(
    roomId: string,
    roomInstanceId: string,
    sourceType: "prompt" | "file",
  ): GenerationLease {
    const existing = this.rooms.get(roomId);
    if (existing?.roomInstanceId === roomInstanceId && existing.generationStatus === "generating") {
      throw new RoomGenerationInProgressError("Bu oda için soru üretimi zaten devam ediyor.");
    }

    const now = Date.now();
    const generationToken = randomUUID();
    const keepExisting = existing?.roomInstanceId === roomInstanceId ? existing : null;
    this.rooms.set(roomId, {
      roomId,
      roomInstanceId,
      gameId: "room-retrospective",
      provider: keepExisting?.provider ?? "demo",
      questions: keepExisting?.questions ?? [],
      questionSetId: keepExisting?.questionSetId ?? randomUUID(),
      generationStatus: "generating",
      generationToken,
      currentQuestionIndex: keepExisting?.currentQuestionIndex ?? 0,
      createdAt: keepExisting?.createdAt ?? now,
      updatedAt: now,
      sourceType,
      gameProgress: keepExisting?.gameProgress ?? {},
    });
    return { roomId, roomInstanceId, generationToken };
  }

  commitGeneration(lease: GenerationLease, generated: GenerateQuestionsResponse): RoomQuestionSet {
    const state = this.requireCurrentLease(lease);
    const now = Date.now();
    const next: RoomAIState = {
      ...state,
      provider: generated.provider,
      questions: structuredClone(generated.questions),
      questionSetId: randomUUID(),
      generationStatus: "ready",
      currentQuestionIndex: 0,
      updatedAt: now,
      gameProgress: {},
    };
    delete next.generationToken;
    this.rooms.set(lease.roomId, next);
    return publicValue(next);
  }

  failGeneration(lease: GenerationLease): RoomQuestionSet | null {
    const state = this.requireCurrentLease(lease);
    const next: RoomAIState = {
      ...state,
      generationStatus: state.questions.length > 0 ? "ready" : "failed",
      updatedAt: Date.now(),
    };
    delete next.generationToken;
    this.rooms.set(lease.roomId, next);
    return next.questions.length > 0 ? publicValue(next) : null;
  }

  getQuestionsForRoom(roomId: string, roomInstanceId?: string): RoomQuestionSet | null {
    const state = this.rooms.get(roomId);
    if (!state || (roomInstanceId && state.roomInstanceId !== roomInstanceId) || state.questions.length === 0) return null;
    return publicValue(state);
  }

  hasQuestions(roomId: string, roomInstanceId?: string): boolean {
    return this.getQuestionsForRoom(roomId, roomInstanceId) !== null;
  }

  getNextQuestion(roomId: string, gameType: string): GeneratedQuestion | null {
    const state = this.rooms.get(roomId);
    if (!state || state.questions.length === 0) return null;
    const progress = state.gameProgress[gameType] ?? { currentQuestionIndex: 0 };
    const question = state.questions[progress.currentQuestionIndex % state.questions.length] ?? null;
    progress.currentQuestionIndex += 1;
    state.gameProgress[gameType] = progress;
    state.currentQuestionIndex = progress.currentQuestionIndex;
    state.updatedAt = Date.now();
    return question ? structuredClone(question) : null;
  }

  resetQuestionProgress(roomId: string, gameType: string): boolean {
    const state = this.rooms.get(roomId);
    if (!state) return false;
    delete state.gameProgress[gameType];
    state.currentQuestionIndex = 0;
    state.updatedAt = Date.now();
    return true;
  }

  closeRoom(roomId: string, roomInstanceId?: string): boolean {
    const state = this.rooms.get(roomId);
    if (!state || (roomInstanceId && state.roomInstanceId !== roomInstanceId)) return false;
    return this.rooms.delete(roomId);
  }

  getStatus(roomId: string): RoomAIState["generationStatus"] | null {
    return this.rooms.get(roomId)?.generationStatus ?? null;
  }

  get size(): number {
    return this.rooms.size;
  }

  private requireCurrentLease(lease: GenerationLease): RoomAIState {
    const state = this.rooms.get(lease.roomId);
    if (!state || state.roomInstanceId !== lease.roomInstanceId || state.generationToken !== lease.generationToken) {
      throw new StaleRoomGenerationError("Eski soru üretimi artık geçerli değil.");
    }
    return state;
  }
}
