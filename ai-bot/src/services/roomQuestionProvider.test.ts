import assert from "node:assert/strict";
import test from "node:test";
import type { AiQuestionGenerationService } from "./questionProvider.js";
import { RoomQuestionProvider } from "./roomQuestionProvider.js";
import { RoomQuestionStore } from "./roomQuestionStore.js";

test("aynı oda için üretimi bir kez yapar ve bütün oyunlara aynı paketi sağlar", async () => {
  let calls = 0;
  const generator: AiQuestionGenerationService = {
    async generate(request) {
      calls++;
      return { gameId: request.gameId, provider: "gemini", questions: [{ id: "q1", text: "Kediler ekip iletişimini nasıl etkiler?", category: "teamwork", gameCategory: "work" }] };
    },
  };
  const fallback: AiQuestionGenerationService = { generate: async () => { throw new Error("unused"); } };
  const provider = new RoomQuestionProvider(new RoomQuestionStore(60_000), generator, fallback);
  const request = { gameId: "room-retrospective", topic: "kediler", language: "tr", style: "dengeli" as const, count: 20 };

  const first = await provider.prepareQuestionsForRoom("ABC234", request);
  const second = await provider.prepareQuestionsForRoom("ABC234", request);

  assert.equal(calls, 1);
  assert.equal(first.questionSetId, second.questionSetId);
  assert.equal(provider.getQuestionsForRoom("ABC234")?.questions[0]?.text, "Kediler ekip iletişimini nasıl etkiler?");
});
