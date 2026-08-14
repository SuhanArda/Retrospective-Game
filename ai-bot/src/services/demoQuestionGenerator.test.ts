import assert from "node:assert/strict";
import test from "node:test";
import { demoQuestionPools, questionStyles, spinTheBottleDemoQuestions } from "../data/demoQuestions.js";
import { generateDemoQuestions } from "./demoQuestionGenerator.js";

test("üç kategoride toplam 60 benzersiz demo sorusu barındırır", () => {
  const allTexts = questionStyles.flatMap((style) => {
    const pool = demoQuestionPools[style];
    assert.equal(pool.length, 20);
    assert.ok(pool.some((question) => question.gameCategory === "work"));
    assert.ok(pool.some((question) => question.gameCategory === "entertainment"));
    return pool.map((question) => question.text);
  });
  assert.equal(allTexts.length, 60);
  assert.equal(new Set(allTexts).size, 60);
});

test("Spin the Bottle için 15 iş ve 15 eğlence demo sorusu üretir", () => {
  const result = generateDemoQuestions({
    gameId: "spin-the-bottle",
    topic: "genel retrospektif",
    language: "tr",
    style: "eğlendirici",
    count: 30,
  });
  assert.equal(result.provider, "demo");
  assert.equal(spinTheBottleDemoQuestions.length, 30);
  assert.equal(result.questions.length, 30);
  assert.equal(result.questions.filter((question) => question.gameCategory === "work").length, 15);
  assert.equal(result.questions.filter((question) => question.gameCategory === "entertainment").length, 15);
  assert.equal(new Set(result.questions.map((question) => question.id)).size, 30);
});

test("ortak oda profili için bütün oyunların kullanacağı 20 demo sorusu üretir", () => {
  const result = generateDemoQuestions({
    gameId: "room-retrospective",
    topic: "genel retrospektif",
    language: "tr",
    style: "dengeli",
    count: 20,
  });
  assert.equal(result.questions.length, 20);
  assert.ok(result.questions.some((question) => question.gameCategory === "work"));
  assert.ok(result.questions.some((question) => question.gameCategory === "entertainment"));
});
