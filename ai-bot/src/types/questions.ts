export type QuestionStyle = "dengeli" | "eğlendirici" | "düşündürücü";

export interface GenerateQuestionsRequest {
  /** Kept only as a backwards-compatible profile label; generation is room-owned. */
  gameId: "room-retrospective";
  topic: string;
  reportText?: string;
  language: string;
  style: QuestionStyle;
  count: 20;
}

export interface GeneratedQuestion {
  id: string;
  text: string;
  answer: string;
  options?: string[];
  correctOptionIndex?: number;
  difficulty?: "easy" | "medium" | "hard";
  /** Optional presentation metadata used by the existing game screens. */
  category?: "reflection" | "teamwork" | "improvement" | "fun";
  gameCategory?: "work" | "entertainment";
}

export interface GenerateQuestionsResponse {
  gameId: "room-retrospective";
  provider: "demo" | "gemini";
  questions: GeneratedQuestion[];
}

export interface QuestionDraft extends Omit<GeneratedQuestion, "id"> {}

export interface CreateRoomQuestionsRequest extends GenerateQuestionsRequest {}

export type RoomGenerationStatus = "idle" | "generating" | "ready" | "failed";

export interface GameQuestionProgress {
  currentQuestionIndex: number;
}

export interface RoomQuestionSet extends GenerateQuestionsResponse {
  roomId: string;
  roomInstanceId: string;
  questionSetId: string;
  generationStatus: RoomGenerationStatus;
  currentQuestionIndex: number;
  createdAt: number;
  updatedAt: number;
  sourceType?: "prompt" | "file";
}

export interface RoomAIState extends RoomQuestionSet {
  generationToken?: string;
  gameProgress: Record<string, GameQuestionProgress>;
}
