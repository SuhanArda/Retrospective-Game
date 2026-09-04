import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { loadConfig } from "./config.js";
import { LocalPrivateQuestionGenerator, createAiQuestionGenerationService } from "./services/questionProvider.js";
import { extractReportText, ReportValidationError } from "./services/reportParser.js";
import { RoomQuestionStore } from "./services/roomQuestionStore.js";
import { RoomQuestionProvider } from "./services/roomQuestionProvider.js";
import { JsonQuestionBank } from "./services/questionBank.js";
import { PersistingQuestionGenerator, QuestionBankFallbackGenerator } from "./services/resilientQuestionProvider.js";
import { validateGenerateQuestionsRequest, validateRoomEnvelope, validateRoomQuestionRequest } from "./validation/questionRequest.js";
import { RoomGenerationInProgressError, StaleRoomGenerationError } from "./services/roomQuestionStore.js";

const config = loadConfig();
const store = new RoomQuestionStore();
const localFallback = new LocalPrivateQuestionGenerator();
const questionBank = new JsonQuestionBank({ path: config.questionBankPath, maxItems: config.questionBankMaxItems });
const generator = new PersistingQuestionGenerator(createAiQuestionGenerationService(config), questionBank);
const fallback = new QuestionBankFallbackGenerator(questionBank, localFallback);
const roomQuestions = new RoomQuestionProvider(store, generator, fallback);
const activeGenerations = new Map<string, { roomInstanceId: string; controller: AbortController }>();
const lastGenerationAttempts = new Map<string, number>();
const maximumBodySize = Math.ceil(config.maxReportSizeBytes * 4 / 3) + 65_536;
const roomRoute = /^\/rooms\/([A-Z0-9]{6})\/questions$/;
const closeRoomRoute = /^\/rooms\/([A-Z0-9]{6})$/;

function applyCors(request: IncomingMessage, response: ServerResponse): void {
  const requestOrigin = request.headers.origin;
  if (config.allowedOrigins === "*") {
    response.setHeader("Access-Control-Allow-Origin", "*");
  } else if (requestOrigin && config.allowedOrigins.includes(requestOrigin)) {
    response.setHeader("Access-Control-Allow-Origin", requestOrigin);
    response.setHeader("Vary", "Origin");
  }
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Internal-Service-Key");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function isAuthorized(request: IncomingMessage): boolean {
  if (!config.internalServiceKey) return true;
  const supplied = request.headers["x-internal-service-key"];
  if (typeof supplied !== "string") return false;
  const expectedBuffer = Buffer.from(config.internalServiceKey);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalSize = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalSize += buffer.length;
    if (totalSize > maximumBodySize) throw new ReportValidationError("İstek gövdesi çok büyük.");
    chunks.push(buffer);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new ReportValidationError("İstek gövdesi geçerli JSON değil."); }
}

async function resolveReportInput(value: unknown): Promise<unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
  const { reportFile, ...requestData } = value as Record<string, unknown>;
  if (reportFile === undefined || reportFile === null) return requestData;
  return { ...requestData, reportText: await extractReportText(reportFile, config.maxReportSizeBytes) };
}

async function produce(requestData: ReturnType<typeof validateGenerateQuestionsRequest> & { success: true }, signal?: AbortSignal) {
  try {
    return await generator.generate(requestData.data, signal);
  } catch {
    if (signal?.aborted) throw new Error("Soru üretimi iptal edildi.");
    return fallback.generate(requestData.data, signal);
  }
}

const server = createServer(async (request, response) => {
  applyCors(request, response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }
  const url = new URL(request.url ?? "/", "http://request.invalid");
  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, { status: "ok", provider: config.questionProvider, activeRoomCount: store.size });
    return;
  }
  const isDirectGeneration = request.method === "POST" && url.pathname === "/questions/generate";
  const isRoomGeneration = request.method === "POST" && roomRoute.test(url.pathname);
  const generationRoute = isDirectGeneration ? "direct" : isRoomGeneration ? "room" : null;
  if (generationRoute) console.log(`[AI Request] received route=${generationRoute}`);
  if (!isAuthorized(request)) {
    if (generationRoute) console.warn(`[AI Request] authentication failed route=${generationRoute} status=401`);
    sendJson(response, 401, { error: "Yetkisiz servis isteği." });
    return;
  }
  if (generationRoute) {
    console.log(`[AI Request] authenticated route=${generationRoute} provider=${config.questionProvider}`);
  }

  const roomMatch = roomRoute.exec(url.pathname);
  const closeMatch = closeRoomRoute.exec(url.pathname);

  try {
    if (request.method === "POST" && url.pathname === "/questions/generate") {
      const validation = validateGenerateQuestionsRequest(await resolveReportInput(await readJson(request)));
      if (!validation.success) {
        console.warn(`[AI Request] validation failed route=direct rejectedFields=${validation.errors.length}`);
        sendJson(response, 400, { error: "Geçersiz istek.", details: validation.errors });
        return;
      }
      sendJson(response, 200, await produce(validation));
      return;
    }

    if (roomMatch && request.method === "POST") {
      const input = await resolveReportInput(await readJson(request));
      const validation = validateRoomQuestionRequest(input);
      const envelope = validateRoomEnvelope(input);
      if (!validation.success) {
        console.warn(`[AI Request] validation failed route=room rejectedFields=${validation.errors.length}`);
        sendJson(response, 400, { error: "Geçersiz istek.", details: validation.errors });
        return;
      }
      if (!envelope.success) {
        console.warn(`[AI Request] validation failed route=room rejectedFields=${envelope.errors.length}`);
        sendJson(response, 400, { error: "Geçersiz istek.", details: envelope.errors });
        return;
      }
      const roomCode = roomMatch[1]!;
      const existing = roomQuestions.getQuestionsForRoom(roomCode, envelope.roomInstanceId);
      if (existing && !envelope.replaceExisting) {
        console.log(`[AI Request] completed source=room-cache count=${existing.questions.length}`);
        sendJson(response, 200, existing);
        return;
      }
      const key = roomCode;
      if (activeGenerations.has(key)) {
        sendJson(response, 409, { error: "Bu oda için soru üretimi zaten devam ediyor." });
        return;
      }
      const now = Date.now();
      const lastAttempt = lastGenerationAttempts.get(key) ?? 0;
      if (now - lastAttempt < config.roomRateLimitMs) {
        response.setHeader("Retry-After", Math.ceil((config.roomRateLimitMs - (now - lastAttempt)) / 1000));
        sendJson(response, 429, { error: "Bu oda için çok sık soru üretim isteği gönderildi." });
        return;
      }
      lastGenerationAttempts.set(key, now);
      const controller = new AbortController();
      activeGenerations.set(key, { roomInstanceId: envelope.roomInstanceId, controller });
      try {
        const sourceType = validation.data.reportText ? "file" : "prompt";
        const questionSet = await roomQuestions.prepareQuestionsForRoom(roomCode, envelope.roomInstanceId, validation.data, {
          replaceExisting: envelope.replaceExisting,
          sourceType,
          signal: controller.signal,
        });
        sendJson(response, 201, questionSet);
      } finally {
        if (activeGenerations.get(key)?.controller === controller) activeGenerations.delete(key);
      }
      return;
    }

    if (roomMatch && request.method === "GET") {
      const roomInstanceId = url.searchParams.get("roomInstanceId")?.trim();
      if (!roomInstanceId) {
        sendJson(response, 400, { error: "roomInstanceId gereklidir." });
        return;
      }
      const questionSet = roomQuestions.getQuestionsForRoom(roomMatch[1]!, roomInstanceId);
      sendJson(response, questionSet ? 200 : 404, questionSet ?? { error: "Oda için soru paketi bulunamadı." });
      return;
    }

    if (closeMatch && request.method === "DELETE") {
      const roomCode = closeMatch[1]!;
      const roomInstanceId = url.searchParams.get("roomInstanceId")?.trim();
      if (!roomInstanceId) {
        sendJson(response, 400, { error: "roomInstanceId gereklidir." });
        return;
      }
      const active = activeGenerations.get(roomCode);
      if (active?.roomInstanceId === roomInstanceId) {
        active.controller.abort();
        activeGenerations.delete(roomCode);
      }
      lastGenerationAttempts.delete(roomCode);
      const deleted = roomQuestions.closeRoom(roomCode, roomInstanceId);
      sendJson(response, 200, { deleted });
      return;
    }

    sendJson(response, 404, { error: "Endpoint bulunamadı." });
  } catch (error: unknown) {
    if (error instanceof ReportValidationError) {
      sendJson(response, 400, { error: error.message });
      return;
    }
    if (error instanceof RoomGenerationInProgressError) {
      sendJson(response, 409, { error: error.message });
      return;
    }
    if (error instanceof StaleRoomGenerationError) {
      sendJson(response, 409, { error: "Oda kapandığı veya yeni üretim başladığı için eski sonuç kullanılmadı." });
      return;
    }
    if (generationRoute) console.error(`[AI Request] failed route=${generationRoute} stage=request_processing`);
    else console.error("AI soru isteği güvenli biçimde sonlandırıldı.");
    sendJson(response, 500, { error: "İşlem tamamlanamadı." });
  }
});

server.listen(config.port, () => {
  console.log(
    `[AI Config] provider=${config.questionProvider} geminiKeyConfigured=${Boolean(config.apiKey)} `
    + `model=${config.model} internalServiceKeyConfigured=${Boolean(config.internalServiceKey)} `
    + `questionBankPath=${config.questionBankPath} questionBankMaxItems=${config.questionBankMaxItems}`,
  );
  console.log(`AI bot is listening on port ${config.port}.`);
});
