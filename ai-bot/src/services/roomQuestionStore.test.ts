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
  assert.equal(store.get("ABC234")?.questionSetId, saved.questionSetId);
  assert.equal(store.delete("ABC234"), true);
  assert.equal(store.get("ABC234"), null);
});

test("aynı oda için eski soru paketini değiştirir", () => {
  const store = new RoomQuestionStore(60_000);
  const first = store.set("ABC234", generated);
  const second = store.set("ABC234", generated);
  assert.notEqual(first.questionSetId, second.questionSetId);
  assert.equal(store.size, 1);
});
