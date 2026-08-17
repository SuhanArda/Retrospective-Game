import assert from "node:assert/strict";
import test from "node:test";
import { validateRoomEnvelope, validateRoomQuestionRequest } from "./questionRequest.js";

test("oda üretimi gameId olmadan çalışır", () => {
  const result = validateRoomQuestionRequest({ topic: "kediler", language: "tr", style: "dengeli", count: 20 });
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.gameId, "room-retrospective");
});

test("bilinmeyen yeni oyun adı AI servisini sınırlamaz", () => {
  const result = validateRoomQuestionRequest({ gameId: "future-game", topic: "ekip", language: "tr", style: "dengeli", count: 20 });
  assert.equal(result.success, true);
});

test("tam 20 soru ve geçerli kaynak ister", () => {
  assert.equal(validateRoomQuestionRequest({ topic: "ekip", language: "tr", style: "dengeli", count: 19 }).success, false);
  assert.equal(validateRoomQuestionRequest({ language: "tr", style: "dengeli", count: 20 }).success, false);
});

test("roomInstanceId ve atomik yenileme niyetini doğrular", () => {
  const result = validateRoomEnvelope({ roomInstanceId: "instance-1", replaceExisting: true });
  assert.deepEqual(result, { success: true, roomInstanceId: "instance-1", replaceExisting: true });
});
