import assert from "node:assert/strict";
import test from "node:test";
import { RoomQuestionStore } from "./roomQuestionStore.js";

const generated = {
  gameId: "spin-the-bottle",
  provider: "demo" as const,
  questions: [{ id: "q1", text: "Soru?", category: "reflection" }],
};

test("oda sorularını RAM'de tutar ve siler", () => {
  const store = new RoomQuestionStore(60_000);
  const saved = store.set("ABC234", generated);
  assert.equal(store.getQuestionsForRoom("ABC234")?.questionSetId, saved.questionSetId);
  assert.equal(store.hasAiQuestions("ABC234"), true);
  assert.equal(store.delete("ABC234"), true);
  assert.equal(store.getQuestionsForRoom("ABC234"), null);
});

test("aynı oda için eski soru paketini değiştirir", () => {
  const store = new RoomQuestionStore(60_000);
  const first = store.set("ABC234", generated);
  const second = store.set("ABC234", generated);
  assert.notEqual(first.questionSetId, second.questionSetId);
  assert.equal(store.size, 1);
});

test("aynı odada oyun değişse bile tek aktif soru paketini tutar", () => {
  const store = new RoomQuestionStore(60_000);
  store.set("ABC234", generated);
  const rush = store.set("ABC234", { ...generated, gameId: "retro-rush" });

  assert.equal(store.getQuestionsForRoom("ABC234")?.questionSetId, rush.questionSetId);
  assert.equal(store.getQuestionsForRoom("ABC234")?.gameId, "retro-rush");
  assert.equal(store.size, 1);
});

test("oyunların ilerlemesini aynı paket üzerinde ayrı izler", () => {
  const store = new RoomQuestionStore(60_000);
  store.set("ABC234", {
    ...generated,
    questions: [
      { id: "q1", text: "Birinci soru?", category: "reflection" },
      { id: "q2", text: "İkinci soru?", category: "improvement" },
    ],
  });

  assert.equal(store.getNextQuestion("ABC234", "spin-the-bottle")?.id, "q1");
  assert.equal(store.getNextQuestion("ABC234", "spin-the-bottle")?.id, "q2");
  assert.equal(store.getNextQuestion("ABC234", "retro-rush")?.id, "q1");
  assert.equal(store.resetQuestionProgress("ABC234", "spin-the-bottle"), true);
  assert.equal(store.getNextQuestion("ABC234", "spin-the-bottle")?.id, "q1");
});
