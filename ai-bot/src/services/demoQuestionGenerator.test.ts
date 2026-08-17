import assert from "node:assert/strict";
import test from "node:test";
import type { GenerateQuestionsRequest } from "../types/questions.js";
import { generateDemoQuestions } from "./demoQuestionGenerator.js";

test("Gemini kullanılamadığında mevcut havuzlardan ortak 20 soru hazırlar", () => {
  const request: GenerateQuestionsRequest = {
    gameId: "room-retrospective", topic: "retro", language: "tr", style: "dengeli", count: 20,
  };
  const response = generateDemoQuestions(request);
  assert.equal(response.questions.length, 20);
  assert.equal(response.questions.filter((question) => question.gameCategory === "work").length, 10);
  assert.equal(response.questions.filter((question) => question.gameCategory === "entertainment").length, 10);
  assert.ok(response.questions.every((question) => question.answer.length > 0));
});
