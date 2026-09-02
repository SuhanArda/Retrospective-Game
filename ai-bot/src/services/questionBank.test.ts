import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { GeneratedQuestion, GenerateQuestionsRequest } from "../types/questions.js";
import { JsonQuestionBank, normalizeQuestionText } from "./questionBank.js";

const request: GenerateQuestionsRequest = {
  gameId: "room-retrospective",
  topic: "sprint retrospective",
  language: "tr",
  style: "dengeli",
  count: 20,
};

function questions(label: string, count = 20): GeneratedQuestion[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${label}-${index}`,
    text: `${label} için yeterince uzun ${index + 1}. retrospektif sorusu?`,
    answer: `${label} cevabı ${index + 1}`,
    category: index % 2 === 0 ? "reflection" : "fun",
    gameCategory: index % 2 === 0 ? "work" : "entertainment",
  }));
}

async function temporaryBank(t: test.TestContext, maxItems = 1000) {
  const directory = await mkdtemp(join(tmpdir(), "question-bank-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "generated-question-bank.json");
  const messages: string[] = [];
  const bank = new JsonQuestionBank({
    path,
    maxItems,
    logger: { log: (message) => messages.push(message), warn: (message) => messages.push(message) },
  });
  return { bank, directory, path, messages };
}

test("missing bank starts empty and is lazily created on the first save", async (t) => {
  const { bank, path } = await temporaryBank(t);
  assert.deepEqual(await bank.load(), []);
  assert.equal(await bank.saveGeneratedQuestions(request, questions("missing")), 20);
  const document = JSON.parse(await readFile(path, "utf8")) as { version: number; questions: unknown[] };
  assert.equal(document.version, 1);
  assert.equal(document.questions.length, 20);
});

test("normalizes whitespace and case when deduplicating while preserving display text", async (t) => {
  const { bank } = await temporaryBank(t);
  const original = questions("Tekrar")[0]!;
  assert.equal(await bank.saveGeneratedQuestions(request, [original]), 1);
  assert.equal(await bank.saveGeneratedQuestions(request, [{ ...original, text: `  ${original.text.toLocaleUpperCase("tr-TR")}  ` }]), 0);
  assert.equal((await bank.load())[0]?.text, original.text);
  assert.equal(await bank.contains(` ${original.text.toLocaleUpperCase("tr-TR")} `), true);
});

test("corrupt JSON is preserved and treated as an empty bank", async (t) => {
  const { bank, directory, path, messages } = await temporaryBank(t);
  await writeFile(path, "{not-json", "utf8");
  assert.deepEqual(await bank.load(), []);
  assert.ok(messages.some((message) => message.includes("invalid question bank ignored")));
  assert.ok((await readdir(directory)).some((name) => name.startsWith("generated-question-bank.json.corrupt-")));
});

test("concurrent saves are serialized without lost records or invalid JSON", async (t) => {
  const { bank, path } = await temporaryBank(t);
  await Promise.all(Array.from({ length: 8 }, (_, index) =>
    bank.saveGeneratedQuestions(request, questions(`concurrent-${index}`))));
  const document = JSON.parse(await readFile(path, "utf8")) as { questions: unknown[] };
  assert.equal(document.questions.length, 160);
  assert.equal((await bank.load()).length, 160);
});

test("fallback usage metadata is updated and used questions are deprioritized", async (t) => {
  const { bank } = await temporaryBank(t);
  await bank.saveGeneratedQuestions(request, questions("first", 40));
  const first = await bank.getFallbackQuestions(request, 20);
  const second = await bank.getFallbackQuestions(request, 20);
  const firstTexts = new Set(first.map((question) => normalizeQuestionText(question.text)));
  assert.ok(second.every((question) => !firstTexts.has(normalizeQuestionText(question.text))));
  const persisted = await bank.load();
  assert.ok(persisted.every((question) => question.usageCount === 1 && question.lastUsedAtUtc !== null));
});

test("same style and topic outrank style-only and general records", async (t) => {
  const { bank } = await temporaryBank(t);
  await bank.saveGeneratedQuestions({ ...request, style: "eğlendirici", topic: "başka konu" }, questions("general"));
  await bank.saveGeneratedQuestions({ ...request, topic: "başka konu" }, questions("style"));
  await bank.saveGeneratedQuestions(request, questions("exact"));
  const selected = await bank.getFallbackQuestions(request, 20);
  assert.ok(selected.every((question) => question.text.startsWith("exact")));
});

test("prunes oldest records to the configured maximum", async (t) => {
  let tick = 0;
  const directory = await mkdtemp(join(tmpdir(), "question-bank-prune-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const bank = new JsonQuestionBank({
    path: join(directory, "bank.json"),
    maxItems: 25,
    now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)),
    logger: { log: () => undefined, warn: () => undefined },
  });
  await bank.saveGeneratedQuestions(request, questions("old"));
  await bank.saveGeneratedQuestions(request, questions("new"));
  const stored = await bank.load();
  assert.equal(stored.length, 25);
  assert.equal(stored.filter((question) => question.text.startsWith("new")).length, 20);
});
