import assert from "node:assert/strict";
import test from "node:test";
import type { GenerateQuestionsRequest, GenerateQuestionsResponse, GeneratedQuestion } from "../types/questions.js";
import type { AiQuestionGenerationService } from "./questionProvider.js";
import type { QuestionBank, StoredQuestionRecord } from "./questionBank.js";
import { PersistingQuestionGenerator, QuestionBankFallbackGenerator } from "./resilientQuestionProvider.js";

const request: GenerateQuestionsRequest = {
  gameId: "room-retrospective", topic: "sprint retrospective", language: "tr", style: "dengeli", count: 20,
};

function generated(label: string, provider: "gemini" | "demo" = "gemini"): GenerateQuestionsResponse {
  return {
    gameId: "room-retrospective",
    provider,
    questions: Array.from({ length: 20 }, (_, index) => ({
      id: `${label}-${index}`,
      text: `${label} için benzersiz ${index + 1}. retrospektif sorusu?`,
      answer: `${label} cevabı ${index + 1}`,
      category: index < 10 ? "reflection" : "fun",
      gameCategory: index < 10 ? "work" : "entertainment",
    })),
  };
}

function record(question: GeneratedQuestion, index: number): StoredQuestionRecord {
  return {
    id: `bank-${index}`,
    text: question.text,
    style: request.style,
    topic: request.topic,
    language: request.language,
    category: question.category ?? "reflection",
    gameCategory: question.gameCategory ?? "work",
    sourceType: "ai",
    createdAtUtc: "2026-01-01T00:00:00.000Z",
    lastUsedAtUtc: null,
    usageCount: 0,
  };
}

function fakeBank(overrides: Partial<QuestionBank> = {}): QuestionBank {
  return {
    load: async () => [],
    saveGeneratedQuestions: async () => 0,
    getFallbackQuestions: async () => [],
    contains: async () => false,
    prune: async () => 0,
    ...overrides,
  };
}

test("successful Gemini output is returned and persisted", async () => {
  const response = generated("ai");
  let saved: readonly GeneratedQuestion[] = [];
  const logs: string[] = [];
  const primary: AiQuestionGenerationService = { generate: async () => response };
  const service = new PersistingQuestionGenerator(primary, fakeBank({
    saveGeneratedQuestions: async (_request, questions) => { saved = questions; return questions.length; },
  }), { log: (message) => logs.push(message), warn: (message) => logs.push(message) });
  const result = await service.generate(request);
  assert.equal(result, response);
  assert.equal(result.questions.length, 20);
  assert.equal(saved.length, 20);
  assert.ok(logs.some((message) => message.includes("source=gemini")));
});

test("bank-only fallback avoids calling the local provider when enough questions exist", async () => {
  const saved = generated("saved").questions.map(record);
  let localCalls = 0;
  const logs: string[] = [];
  const fallback = new QuestionBankFallbackGenerator(fakeBank({ getFallbackQuestions: async () => saved }), {
    generate: async () => { localCalls++; throw new Error("local should not be needed"); },
  }, { log: (message) => logs.push(message), warn: (message) => logs.push(message) });
  const result = await fallback.generate(request);
  assert.equal(result.questions.length, 20);
  assert.ok(result.questions.every((question) => question.text.startsWith("saved")));
  assert.equal(localCalls, 0);
  assert.ok(logs.some((message) => message.includes("source=question-bank")));
});

test("partial bank fallback is returned first and supplemented without duplicate text", async () => {
  const local = generated("local", "demo");
  const sixSaved = generated("saved").questions.slice(0, 3)
    .concat(generated("saved").questions.slice(10, 13)).map(record);
  const fallback = new QuestionBankFallbackGenerator(fakeBank({ getFallbackQuestions: async () => sixSaved }), {
    generate: async () => local,
  }, { log: () => undefined, warn: () => undefined });
  const result = await fallback.generate(request);
  assert.equal(result.questions.length, 20);
  assert.deepEqual(result.questions.slice(0, 6).map((question) => question.text), sixSaved.map((question) => question.text));
  assert.equal(new Set(result.questions.map((question) => question.text.toLocaleLowerCase("tr-TR"))).size, 20);
  assert.equal(result.questions.filter((question) => question.gameCategory === "work").length, 10);
  assert.equal(result.questions.filter((question) => question.gameCategory === "entertainment").length, 10);
});

test("a persistence failure never hides successful Gemini questions", async () => {
  const warnings: string[] = [];
  const response = generated("ai");
  const service = new PersistingQuestionGenerator(
    { generate: async () => response },
    fakeBank({ saveGeneratedQuestions: async () => { throw new Error("read-only volume"); } }),
    { log: () => undefined, warn: (message) => warnings.push(message) },
  );
  assert.equal(await service.generate(request), response);
  assert.ok(warnings.some((message) => message.includes("read-only volume")));
});

test("bank read failure still reaches the existing local fallback", async () => {
  const local = generated("local", "demo");
  const fallback = new QuestionBankFallbackGenerator(
    fakeBank({ getFallbackQuestions: async () => { throw new Error("unreadable"); } }),
    { generate: async () => local },
    { log: () => undefined, warn: () => undefined },
  );
  assert.deepEqual(await fallback.generate(request), local);
});
