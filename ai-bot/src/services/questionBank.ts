import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { GeneratedQuestion, GenerateQuestionsRequest, QuestionStyle } from "../types/questions.js";

const QUESTION_BANK_VERSION = 1;
const styles: readonly QuestionStyle[] = ["dengeli", "eğlendirici", "düşündürücü"];
const categories = ["reflection", "teamwork", "improvement", "fun"] as const;
const gameCategories = ["work", "entertainment"] as const;

export interface StoredQuestionRecord {
  id: string;
  text: string;
  style: QuestionStyle;
  topic: string;
  language: string;
  category: typeof categories[number];
  gameCategory: typeof gameCategories[number];
  sourceType: "ai";
  createdAtUtc: string;
  lastUsedAtUtc: string | null;
  usageCount: number;
}

interface QuestionBankDocument {
  version: typeof QUESTION_BANK_VERSION;
  questions: StoredQuestionRecord[];
}

export interface QuestionBank {
  load(): Promise<readonly StoredQuestionRecord[]>;
  saveGeneratedQuestions(request: GenerateQuestionsRequest, questions: readonly GeneratedQuestion[]): Promise<number>;
  getFallbackQuestions(request: GenerateQuestionsRequest, count: number): Promise<readonly StoredQuestionRecord[]>;
  contains(text: string): Promise<boolean>;
  prune(): Promise<number>;
}

export interface QuestionBankLogger {
  log(message: string): void;
  warn(message: string): void;
}

interface JsonQuestionBankOptions {
  path: string;
  maxItems: number;
  logger?: QuestionBankLogger;
  now?: () => Date;
}

export function normalizeQuestionText(text: string): string {
  return text.trim().replace(/\s+/gu, " ").toLocaleLowerCase("tr-TR");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function parseStoredQuestion(value: unknown): StoredQuestionRecord | null {
  if (!isRecord(value)) return null;
  const style = styles.find((candidate) => candidate === value.style);
  const category = categories.find((candidate) => candidate === value.category);
  const gameCategory = gameCategories.find((candidate) => candidate === value.gameCategory);
  if (typeof value.id !== "string" || !value.id || typeof value.text !== "string"
      || value.text.trim().length < 10 || value.text.trim().length > 180 || !value.text.trim().endsWith("?")
      || !normalizeQuestionText(value.text) || !style || typeof value.topic !== "string"
      || typeof value.language !== "string" || !value.language || !category || !gameCategory
      || value.sourceType !== "ai" || !isIsoDate(value.createdAtUtc)
      || (value.lastUsedAtUtc !== null && !isIsoDate(value.lastUsedAtUtc))
      || typeof value.usageCount !== "number" || !Number.isInteger(value.usageCount) || value.usageCount < 0) {
    return null;
  }
  return {
    id: value.id,
    text: value.text.trim().replace(/\s+/gu, " "),
    style,
    topic: value.topic,
    language: value.language,
    category,
    gameCategory,
    sourceType: "ai",
    createdAtUtc: value.createdAtUtc,
    lastUsedAtUtc: value.lastUsedAtUtc,
    usageCount: value.usageCount,
  };
}

function parseDocument(text: string): QuestionBankDocument {
  const parsed: unknown = JSON.parse(text);
  if (!isRecord(parsed) || parsed.version !== QUESTION_BANK_VERSION || !Array.isArray(parsed.questions)) {
    throw new Error("unsupported or malformed question bank schema");
  }
  const questions = parsed.questions.map(parseStoredQuestion);
  if (questions.some((question) => question === null)) throw new Error("invalid question bank record");
  return { version: QUESTION_BANK_VERSION, questions: questions as StoredQuestionRecord[] };
}

function topicKey(value: string): string {
  return value.trim().replace(/\s+/gu, " ").toLocaleLowerCase("tr-TR");
}

function selectionRank(record: StoredQuestionRecord, request: GenerateQuestionsRequest): number {
  if (record.style === request.style && topicKey(record.topic) === topicKey(request.topic)) return 0;
  if (record.style === request.style) return 1;
  return 2;
}

function compareForFallback(a: StoredQuestionRecord, b: StoredQuestionRecord, request: GenerateQuestionsRequest): number {
  const rank = selectionRank(a, request) - selectionRank(b, request);
  if (rank !== 0) return rank;
  const usage = a.usageCount - b.usageCount;
  if (usage !== 0) return usage;
  if (a.lastUsedAtUtc === null && b.lastUsedAtUtc !== null) return -1;
  if (a.lastUsedAtUtc !== null && b.lastUsedAtUtc === null) return 1;
  const lastUsed = (a.lastUsedAtUtc ?? "").localeCompare(b.lastUsedAtUtc ?? "");
  if (lastUsed !== 0) return lastUsed;
  return b.createdAtUtc.localeCompare(a.createdAtUtc) || a.id.localeCompare(b.id);
}

export class JsonQuestionBank implements QuestionBank {
  private readonly path: string;
  private readonly maxItems: number;
  private readonly logger: QuestionBankLogger;
  private readonly now: () => Date;
  private document: QuestionBankDocument | null = null;
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(options: JsonQuestionBankOptions) {
    this.path = options.path;
    this.maxItems = options.maxItems;
    this.logger = options.logger ?? console;
    this.now = options.now ?? (() => new Date());
  }

  load(): Promise<readonly StoredQuestionRecord[]> {
    return this.exclusive(async () => structuredClone((await this.ensureLoaded()).questions));
  }

  saveGeneratedQuestions(
    request: GenerateQuestionsRequest,
    questions: readonly GeneratedQuestion[],
  ): Promise<number> {
    return this.exclusive(async () => {
      const document = structuredClone(await this.ensureLoaded());
      const known = new Set(document.questions.map((question) => normalizeQuestionText(question.text)));
      const createdAtUtc = this.now().toISOString();
      const additions: StoredQuestionRecord[] = [];
      for (const question of questions) {
        const text = question.text.trim().replace(/\s+/gu, " ");
        const normalized = normalizeQuestionText(text);
        if (text.length < 10 || text.length > 180 || !text.endsWith("?") || !normalized || known.has(normalized)
            || !question.category || !categories.includes(question.category)
            || !question.gameCategory || !gameCategories.includes(question.gameCategory)) continue;
        known.add(normalized);
        additions.push({
          id: randomUUID(),
          text,
          style: request.style,
          topic: request.topic.trim(),
          language: request.language.trim(),
          category: question.category,
          gameCategory: question.gameCategory,
          sourceType: "ai",
          createdAtUtc,
          lastUsedAtUtc: null,
          usageCount: 0,
        });
      }
      if (additions.length === 0) return 0;
      document.questions.push(...additions);
      this.pruneDocument(document);
      await this.writeDocument(document);
      this.document = document;
      this.logger.log(`[QuestionBank] stored ${additions.length} new questions`);
      return additions.length;
    });
  }

  getFallbackQuestions(
    request: GenerateQuestionsRequest,
    count: number,
  ): Promise<readonly StoredQuestionRecord[]> {
    return this.exclusive(async () => {
      if (count <= 0) return [];
      const document = structuredClone(await this.ensureLoaded());
      const candidates = document.questions
        .filter((question) => question.language.toLocaleLowerCase() === request.language.toLocaleLowerCase())
        .sort((a, b) => compareForFallback(a, b, request));
      const workTarget = Math.ceil(count / 2);
      const entertainmentTarget = count - workTarget;
      const selected: StoredQuestionRecord[] = [];
      const selectedTexts = new Set<string>();
      let workCount = 0;
      let entertainmentCount = 0;
      for (const question of candidates) {
        if (selected.length >= count) break;
        const normalized = normalizeQuestionText(question.text);
        if (selectedTexts.has(normalized)) continue;
        if (question.gameCategory === "work" && workCount < workTarget) {
          selected.push(question);
          selectedTexts.add(normalized);
          workCount++;
        } else if (question.gameCategory === "entertainment" && entertainmentCount < entertainmentTarget) {
          selected.push(question);
          selectedTexts.add(normalized);
          entertainmentCount++;
        }
      }
      if (selected.length === 0) return [];
      const usedAtUtc = this.now().toISOString();
      for (const question of selected) {
        question.usageCount += 1;
        question.lastUsedAtUtc = usedAtUtc;
      }
      try {
        await this.writeDocument(document);
      } catch (error: unknown) {
        this.logger.warn(`[QuestionBank] could not update fallback usage metadata: ${messageOf(error)}`);
      }
      this.document = document;
      return structuredClone(selected);
    });
  }

  contains(text: string): Promise<boolean> {
    return this.exclusive(async () => {
      const normalized = normalizeQuestionText(text);
      return (await this.ensureLoaded()).questions.some((question) => normalizeQuestionText(question.text) === normalized);
    });
  }

  prune(): Promise<number> {
    return this.exclusive(async () => {
      const document = structuredClone(await this.ensureLoaded());
      const removed = this.pruneDocument(document);
      if (removed > 0) {
        await this.writeDocument(document);
        this.document = document;
      }
      return removed;
    });
  }

  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationQueue.then(operation, operation);
    this.mutationQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  private async ensureLoaded(): Promise<QuestionBankDocument> {
    if (this.document) return this.document;
    try {
      const text = await readFile(this.path, "utf8");
      if (!text.trim()) throw new Error("empty question bank file");
      this.document = parseDocument(text);
      this.logger.log(`[QuestionBank] loaded ${this.document.questions.length} questions`);
    } catch (error: unknown) {
      this.document = { version: QUESTION_BANK_VERSION, questions: [] };
      if (isFileError(error, "ENOENT")) return this.document;
      this.logger.warn(`[QuestionBank] invalid question bank ignored: ${messageOf(error)}`);
      await this.preserveCorruptFile();
    }
    return this.document;
  }

  private async preserveCorruptFile(): Promise<void> {
    const suffix = this.now().toISOString().replace(/[:.]/gu, "-");
    try {
      await rename(this.path, `${this.path}.corrupt-${suffix}`);
    } catch (error: unknown) {
      if (!isFileError(error, "ENOENT")) {
        this.logger.warn(`[QuestionBank] corrupt file could not be preserved: ${messageOf(error)}`);
      }
    }
  }

  private pruneDocument(document: QuestionBankDocument): number {
    const overflow = document.questions.length - this.maxItems;
    if (overflow <= 0) return 0;
    document.questions.sort((a, b) => b.createdAtUtc.localeCompare(a.createdAtUtc) || a.id.localeCompare(b.id));
    document.questions.splice(this.maxItems);
    return overflow;
  }

  private async writeDocument(document: QuestionBankDocument): Promise<void> {
    const directory = dirname(this.path);
    await mkdir(directory, { recursive: true });
    const temporaryPath = `${this.path}.tmp-${process.pid}-${randomUUID()}`;
    try {
      await writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
      await rename(temporaryPath, this.path);
    } catch (error: unknown) {
      try { await unlink(temporaryPath); }
      catch { /* The temporary file may not have been created. */ }
      throw error;
    }
  }
}

function isFileError(error: unknown, code: string): boolean {
  return isRecord(error) && error.code === code;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "unknown storage error";
}
