import { randomUUID } from "node:crypto";
import {
  demoQuestionPools,
  questionStyles,
  spinTheBottleDemoQuestions,
  type QuestionStyle,
} from "../data/demoQuestions.js";
import type { GenerateQuestionsRequest, GenerateQuestionsResponse } from "../types/questions.js";

function findStyle(value: string | undefined): QuestionStyle {
  const normalized = value?.trim().toLocaleLowerCase("tr-TR");
  return questionStyles.find((style) => style === normalized) ?? "dengeli";
}

export function generateDemoQuestions(request: GenerateQuestionsRequest): GenerateQuestionsResponse {
  const pool = request.gameId === "spin-the-bottle" ? spinTheBottleDemoQuestions : demoQuestionPools[findStyle(request.style)];
  if (request.count > pool.length) throw new Error("Seçilen demo havuzunda yeterli soru yok.");
  const questions = pool.slice(0, request.count).map((question) => ({ id: randomUUID(), ...question }));

  return { gameId: request.gameId, provider: "demo", questions };
}
