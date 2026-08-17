import { randomUUID } from "node:crypto";
import { demoQuestionPools, questionStyles, spinTheBottleDemoQuestions } from "../data/demoQuestions.js";
import type { GenerateQuestionsRequest, GenerateQuestionsResponse, QuestionStyle } from "../types/questions.js";

function findStyle(value: string | undefined): QuestionStyle {
  const normalized = value?.trim().toLocaleLowerCase("tr-TR") as QuestionStyle | undefined;
  return questionStyles.find((style) => style === normalized) ?? "dengeli";
}

export function generateDemoQuestions(request: GenerateQuestionsRequest): GenerateQuestionsResponse {
  const selected = demoQuestionPools[findStyle(request.style)];
  const candidates = [...selected, ...spinTheBottleDemoQuestions];
  const work = candidates.filter((question) => question.gameCategory === "work").slice(0, 10);
  const entertainment = candidates.filter((question) => question.gameCategory === "entertainment").slice(0, 10);
  if (work.length !== 10 || entertainment.length !== 10) throw new Error("Demo havuzunda yeterli ortak soru yok.");
  const questions = [...work, ...entertainment].map((question) => ({
    id: randomUUID(),
    ...question,
    answer: "Takımın ortak değerlendirmesine göre.",
  }));
  return { gameId: "room-retrospective", provider: "demo", questions };
}
