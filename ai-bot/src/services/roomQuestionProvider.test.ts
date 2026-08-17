import assert from "node:assert/strict";
import test from "node:test";
import type { GenerateQuestionsRequest, GenerateQuestionsResponse } from "../types/questions.js";
import type { AiQuestionGenerationService } from "./questionProvider.js";
import { RoomQuestionProvider } from "./roomQuestionProvider.js";
import { RoomQuestionStore } from "./roomQuestionStore.js";

const request: GenerateQuestionsRequest = {
  gameId: "room-retrospective", topic: "kediler", language: "tr", style: "dengeli", count: 20,
};
const result = (label: string, provider: "gemini" | "demo" = "gemini"): GenerateQuestionsResponse => ({
  gameId: "room-retrospective", provider,
  questions: Array.from({ length: 20 }, (_, index) => ({
    id: `${label}-${index}`, text: `${label} ${index + 1}?`, answer: `${label} cevabı`,
    category: index < 10 ? "reflection" : "fun", gameCategory: index < 10 ? "work" : "entertainment",
  })),
});

test("aynı oda ve farklı oyunlar için Gemini'yi bir kez çağırır", async () => {
  let calls = 0;
  const generator: AiQuestionGenerationService = { generate: async () => { calls++; return result("ai"); } };
  const provider = new RoomQuestionProvider(new RoomQuestionStore(), generator, { generate: async () => result("demo", "demo") });
  const first = await provider.prepareQuestionsForRoom("ABC234", "instance", request, { sourceType: "prompt" });
  const second = await provider.prepareQuestionsForRoom("ABC234", "instance", request, { sourceType: "prompt" });
  assert.equal(calls, 1);
  assert.equal(first.questionSetId, second.questionSetId);
});

test("başarısız yeniden üretim eski geçerli bankayı korur", async () => {
  let fail = false;
  let fallbackCalls = 0;
  const generator: AiQuestionGenerationService = { generate: async () => {
    if (fail) throw new Error("quota");
    return result("eski");
  } };
  const provider = new RoomQuestionProvider(new RoomQuestionStore(), generator, {
    generate: async () => { fallbackCalls++; return result("demo", "demo"); },
  });
  const old = await provider.prepareQuestionsForRoom("ABC234", "instance", request, { sourceType: "prompt" });
  fail = true;
  await assert.rejects(provider.prepareQuestionsForRoom("ABC234", "instance", request, {
    sourceType: "file", replaceExisting: true,
  }));
  assert.equal(provider.getQuestionsForRoom("ABC234")?.questionSetId, old.questionSetId);
  assert.equal(fallbackCalls, 0);
});

test("başarılı yeniden üretim bankayı atomik değiştirir", async () => {
  let resolveGeneration: ((value: GenerateQuestionsResponse) => void) | null = null;
  let first = true;
  const generator: AiQuestionGenerationService = { generate: async () => {
    if (first) { first = false; return result("eski"); }
    return new Promise((resolve) => { resolveGeneration = resolve; });
  } };
  const provider = new RoomQuestionProvider(new RoomQuestionStore(), generator, { generate: async () => result("demo", "demo") });
  const old = await provider.prepareQuestionsForRoom("ABC234", "instance", request, { sourceType: "prompt" });
  const replacing = provider.prepareQuestionsForRoom("ABC234", "instance", request, { sourceType: "file", replaceExisting: true });
  await Promise.resolve();
  assert.equal(provider.getQuestionsForRoom("ABC234")?.questionSetId, old.questionSetId);
  assert.ok(resolveGeneration);
  (resolveGeneration as (value: GenerateQuestionsResponse) => void)(result("yeni"));
  const next = await replacing;
  assert.notEqual(next.questionSetId, old.questionSetId);
  assert.equal(next.questions[0]?.id, "yeni-0");
});

test("AI yoksa demo bankasını bir kez seçer ve oda akışı devam eder", async () => {
  const provider = new RoomQuestionProvider(new RoomQuestionStore(), { generate: async () => { throw new Error("network"); } }, {
    generate: async () => result("demo", "demo"),
  });
  const set = await provider.prepareQuestionsForRoom("ABC234", "instance", request, { sourceType: "prompt" });
  assert.equal(set.provider, "demo");
  assert.equal(set.questions.length, 20);
});

test("aynı oda için eşzamanlı üretimi engeller, farklı odalara izin verir", async () => {
  const resolvers: Array<(value: GenerateQuestionsResponse) => void> = [];
  const generator: AiQuestionGenerationService = { generate: async () => new Promise((resolve) => resolvers.push(resolve)) };
  const provider = new RoomQuestionProvider(new RoomQuestionStore(), generator, { generate: async () => result("demo", "demo") });
  const roomA = provider.prepareQuestionsForRoom("AAA234", "a", request, { sourceType: "prompt" });
  await assert.rejects(provider.prepareQuestionsForRoom("AAA234", "a", request, { sourceType: "prompt" }));
  const roomB = provider.prepareQuestionsForRoom("BBB234", "b", request, { sourceType: "prompt" });
  assert.equal(resolvers.length, 2);
  resolvers[0]!(result("a"));
  resolvers[1]!(result("b"));
  const [a, b] = await Promise.all([roomA, roomB]);
  assert.equal(a.questions[0]?.id, "a-0");
  assert.equal(b.questions[0]?.id, "b-0");
});
