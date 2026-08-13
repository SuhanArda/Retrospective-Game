export interface GenerateQuestionsRequest {
  gameId: string;
  topic: string;
  reportText?: string;
  language: string;
  style: "dengeli" | "eğlendirici" | "düşündürücü";
  count: number;
}

export interface GeneratedQuestion {
  id: string;
  text: string;
  category: string;
  gameCategory?: "work" | "entertainment";
}

export interface GenerateQuestionsResponse {
  gameId: string;
  provider: "demo" | "gemini";
  questions: GeneratedQuestion[];
}

export interface QuestionDraft {
  text: string;
  category: string;
  gameCategory?: "work" | "entertainment";
}

export interface CreateRoomQuestionsRequest extends GenerateQuestionsRequest {}

export interface RoomQuestionSet extends GenerateQuestionsResponse {
  roomCode: string;
  questionSetId: string;
  createdAt: number;
  expiresAt: number;
}
