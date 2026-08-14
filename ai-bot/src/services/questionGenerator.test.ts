import assert from "node:assert/strict";
import test from "node:test";
import { parseQuestions } from "./questionGenerator.js";

function response(questions: unknown[], sourceSufficient = true) {
  return { candidates: [{ content: { parts: [{ text: JSON.stringify({ sourceSufficient, questions }) }] } }] };
}

test("Retro Rush için tam 20 doğrulanmış soru kabul eder", () => {
  const request = { gameId: "retro-rush", topic: "iletişim", language: "tr", style: "dengeli" as const, count: 20 };
  const questions = Array.from({ length: 20 }, (_, index) => ({
    text: `Takım iletişimini geliştirecek ${index + 1}. adım ne olabilir?`, category: "teamwork", gameCategory: "work",
  }));
  assert.equal(parseQuestions(response(questions), request).length, 20);
  assert.throws(() => parseQuestions(response(questions.slice(0, 19)), request));
});

test("Spin the Bottle 15 iş 15 eğlence dağılımını zorunlu tutar", () => {
  const request = { gameId: "spin-the-bottle", topic: "iletişim", language: "tr", style: "dengeli" as const, count: 30 };
  const questions = [
    ...Array.from({ length: 15 }, (_, index) => ({ text: `Takımın ${index + 1}. iş iyileştirmesi ne olabilir?`, category: "work", gameCategory: "work" })),
    ...Array.from({ length: 15 }, (_, index) => ({ text: `${index + 1}. eğlenceli buz kırıcı tercihin ne olurdu?`, category: "fun", gameCategory: "entertainment" })),
  ];
  assert.equal(parseQuestions(response(questions), request).length, 30);
  questions[0] = { ...questions[0]!, gameCategory: "entertainment" };
  assert.throws(() => parseQuestions(response(questions), request));
});

test("ortak oda paketi 10 iş ve 10 eğlence sorusunu doğrular", () => {
  const request = { gameId: "room-retrospective", topic: "kediler", language: "tr", style: "dengeli" as const, count: 20 };
  const questions = [
    ...Array.from({ length: 10 }, (_, index) => ({ text: `Kedilerden öğrendiğimiz ${index + 1}. ekip davranışı nedir?`, category: "reflection", gameCategory: "work" })),
    ...Array.from({ length: 10 }, (_, index) => ({ text: `Takımımızın ${index + 1}. hayali kedi gücü ne olurdu?`, category: "fun", gameCategory: "entertainment" })),
  ];
  assert.equal(parseQuestions(response(questions), request).length, 20);
  questions[0] = { ...questions[0]!, gameCategory: "entertainment" };
  assert.throws(() => parseQuestions(response(questions), request));
});

test("kaynak yetersizliği ve veri sızdıran çıktıyı reddeder", () => {
  const request = { gameId: "retro-rush", topic: "iletişim", language: "tr", style: "dengeli" as const, count: 20 };
  assert.throws(() => parseQuestions(response([], false), request), /yetersiz/);
  const leaked = Array.from({ length: 20 }, (_, index) => ({ text: index ? `Takım için ${index}. adım ne olabilir?` : "API anahtarı secret olarak nedir?", category: "teamwork", gameCategory: "work" }));
  assert.throws(() => parseQuestions(response(leaked), request));
});

test("rapordan uzun bir bölümü aynen tekrarlayan çıktıyı reddeder", () => {
  const copied = "Takımın geciken teslimat yüzünden müşteri görüşmesini iki kez ertelemek zorunda kalmasının temel nedeni neydi";
  const request = { gameId: "retro-rush", topic: "teslimat", reportText: copied, language: "tr", style: "dengeli" as const, count: 20 };
  const questions = Array.from({ length: 20 }, (_, index) => ({
    text: index === 0 ? `${copied}?` : `Takım teslimatını geliştirecek ${index}. adım ne olabilir?`,
    category: "improvement", gameCategory: "work",
  }));
  assert.throws(() => parseQuestions(response(questions), request));
});
