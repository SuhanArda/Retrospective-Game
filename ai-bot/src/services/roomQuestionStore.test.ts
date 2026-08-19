import assert from "node:assert/strict";
import test from "node:test";
import type { GenerateQuestionsResponse } from "../types/questions.js";
import { RoomQuestionStore, StaleRoomGenerationError } from "./roomQuestionStore.js";

const generated = (label: string): GenerateQuestionsResponse => ({
  gameId: "room-retrospective",
  provider: "gemini",
  questions: Array.from({ length: 20 }, (_, index) => ({
    id: `${label}-${index}`,
    text: `${label} hakkında ${index + 1}. soru?`,
    answer: `${label} cevabı`,
    category: index < 10 ? "reflection" : "fun",
    gameCategory: index < 10 ? "work" : "entertainment",
  })),
});

function save(store: RoomQuestionStore, roomId: string, instanceId: string, label: string) {
  const lease = store.beginGeneration(roomId, instanceId, "prompt");
  return store.commitGeneration(lease, generated(label));
}

test("soruları gameType yerine roomId ile saklar", () => {
  const store = new RoomQuestionStore();
  const saved = save(store, "ABC234", "instance-1", "kedi");
  assert.equal(store.getQuestionsForRoom("ABC234", "instance-1")?.questionSetId, saved.questionSetId);
  assert.equal(store.getQuestionsForRoom("OTHER1", "instance-1"), null);
});

test("oyun değişimi ve oyun ilerlemesi ortak soru bankasını silmez", () => {
  const store = new RoomQuestionStore();
  const saved = save(store, "ABC234", "instance-1", "kedi");
  assert.equal(store.getNextQuestion("ABC234", "spin-the-bottle")?.id, "kedi-0");
  assert.equal(store.getNextQuestion("ABC234", "retro-rush")?.id, "kedi-0");
  assert.equal(store.getNextQuestion("ABC234", "rus-ruleti")?.id, "kedi-0");
  assert.equal(store.getNextQuestion("ABC234", "future-game")?.id, "kedi-0");
  assert.equal(store.getQuestionsForRoom("ABC234")?.questionSetId, saved.questionSetId);
});

test("yalnızca kapatılan odanın verisini siler ve tekrar çağrı güvenlidir", () => {
  const store = new RoomQuestionStore();
  save(store, "ABC234", "instance-1", "bir");
  save(store, "XYZ789", "instance-2", "iki");
  assert.equal(store.closeRoom("ABC234", "instance-1"), true);
  assert.equal(store.closeRoom("ABC234", "instance-1"), false);
  assert.ok(store.getQuestionsForRoom("XYZ789", "instance-2"));
});

test("oda kapandıktan sonra geç gelen sonuç kaydı yeniden oluşturamaz", () => {
  const store = new RoomQuestionStore();
  const lease = store.beginGeneration("ABC234", "instance-1", "file");
  store.closeRoom("ABC234", "instance-1");
  assert.throws(() => store.commitGeneration(lease, generated("geç")), StaleRoomGenerationError);
  assert.equal(store.getQuestionsForRoom("ABC234"), null);
});

test("aynı oda kodunun yeni instance'ı eski üretim sonucundan korunur", () => {
  const store = new RoomQuestionStore();
  const oldLease = store.beginGeneration("ABC234", "old", "prompt");
  save(store, "ABC234", "new", "yeni");
  assert.throws(() => store.commitGeneration(oldLease, generated("eski")), StaleRoomGenerationError);
  assert.equal(store.getQuestionsForRoom("ABC234", "new")?.questions[0]?.id, "yeni-0");
});
