import { describe, expect, it } from "vitest";
import type { BotQuestion } from "./questionBotClient";
import { adaptSpinTheBottleQuestion } from "./spinTheBottleQuestionAdapter";

const questions: BotQuestion[] = [
  { id: "w1", text: "Kedi temalı iş sorusu?", answer: "Cevap", category: "reflection", gameCategory: "work" },
  { id: "f1", text: "Kedi temalı eğlence sorusu?", answer: "Cevap", category: "fun", gameCategory: "entertainment" },
];

describe("adaptSpinTheBottleQuestion", () => {
  it("iş ve eğlence havuzlarını karıştırmaz", () => {
    expect(adaptSpinTheBottleQuestion(questions, "İş:0", false)).toBe("Kedi temalı iş sorusu?");
    expect(adaptSpinTheBottleQuestion(questions, "Eğlence:0", true)).toBe("Kedi temalı eğlence sorusu?");
  });

  it("istenen kategoride soru yoksa sabit soruya düşebilmek için null döner", () => {
    expect(adaptSpinTheBottleQuestion(questions.slice(0, 1), "Eğlence:0", true)).toBeNull();
  });
});
