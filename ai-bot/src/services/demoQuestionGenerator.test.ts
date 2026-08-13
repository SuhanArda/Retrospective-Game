import assert from "node:assert/strict";
import test from "node:test";
import { demoQuestionPools, questionStyles } from "../data/demoQuestions.js";
import { generateDemoQuestions } from "./demoQuestionGenerator.js";

test("üç kategoride toplam 45 benzersiz demo sorusu barındırır", () => {
  const allTexts = questionStyles.flatMap((style) => {
    const pool = demoQuestionPools[style];
    assert.equal(pool.length, 15);
    assert.ok(pool.some((question) => question.gameCategory === "work"));
    assert.ok(pool.some((question) => question.gameCategory === "entertainment"));
    return pool.map((question) => question.text);
  });
  assert.equal(allTexts.length, 45);
  assert.equal(new Set(allTexts).size, 45);
});

test("seçilen kategoriye ait 15 benzersiz demo sorusu üretir", () => {
  const result = generateDemoQuestions({
    gameId: "spin-the-bottle",
    topic: "genel retrospektif",
    language: "tr",
    style: "eğlendirici",
    count: 15,
  });
  assert.equal(result.provider, "demo");
  assert.equal(result.questions.length, 15);
  assert.equal(new Set(result.questions.map((question) => question.id)).size, 15);
});
