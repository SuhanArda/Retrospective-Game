import assert from "node:assert/strict";
import test from "node:test";
import { validateGenerateQuestionsRequest, validateRoomQuestionRequest } from "./questionRequest.js";

test("geçerli soru üretme isteğini kabul eder", () => {
  const result = validateGenerateQuestionsRequest({
    gameId: "spin-the-bottle",
    topic: "takım iletişimi",
    language: "tr",
    style: "eğlendirici",
    count: 5,
  });
  assert.equal(result.success, true);
});

test("geçersiz soru sayısını reddeder", () => {
  const result = validateGenerateQuestionsRequest({
    gameId: "retro-rush",
    topic: "sprint",
    language: "tr",
    style: "dengeli",
    count: 31,
  });
  assert.equal(result.success, false);
});

test("rapor metnini konu olmadan kabul eder", () => {
  const result = validateRoomQuestionRequest({
    gameId: "retro-rush",
    reportText: "İletişim ve iş bölümü geliştirilebilir.",
    language: "tr",
    style: "düşündürücü",
    count: 20,
  });
  assert.equal(result.success, true);
});

test("oda oturumu için 20 dışında soru sayısını reddeder", () => {
  const result = validateRoomQuestionRequest({
    gameId: "retro-rush",
    topic: "iletişim",
    language: "tr",
    style: "dengeli",
    count: 15,
  });
  assert.equal(result.success, false);
});

test("oda isteğini oyun bağımsız ortak 20 soruluk profile normalleştirir", () => {
  const spin = validateRoomQuestionRequest({ gameId: "spin_the_bottle", topic: "retro", language: "tr", style: "dengeli", count: 20 });
  const rush = validateRoomQuestionRequest({ gameId: "retro_rush", topic: "retro", language: "tr", style: "dengeli", count: 20 });
  assert.equal(spin.success && spin.data.gameId, "room-retrospective");
  assert.equal(rush.success && rush.data.gameId, "room-retrospective");
  assert.equal(spin.success && spin.data.count, 20);
  assert.equal(rush.success && rush.data.count, 20);
});

test("desteklenmeyen oyunu reddeder", () => {
  const result = validateRoomQuestionRequest({ gameId: "unknown", topic: "retro", language: "tr", style: "dengeli", count: 20 });
  assert.equal(result.success, false);
});
