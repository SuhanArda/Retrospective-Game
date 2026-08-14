import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { loadConfig } from "./config.js";
import { LocalPrivateQuestionGenerator, createAiQuestionGenerationService } from "./services/questionProvider.js";
import { extractReportText, ReportValidationError } from "./services/reportParser.js";
import { RoomQuestionStore } from "./services/roomQuestionStore.js";
import { RoomQuestionProvider } from "./services/roomQuestionProvider.js";
import { validateGenerateQuestionsRequest, validateRoomQuestionRequest } from "./validation/questionRequest.js";
import { isSupportedRoomGame } from "./data/gameProfiles.js";

const config = loadConfig();
const store = new RoomQuestionStore(config.sessionTtlMs);
const generator = createAiQuestionGenerationService(config);
const localFallback = new LocalPrivateQuestionGenerator();
const roomQuestions = new RoomQuestionProvider(store, generator, localFallback, () => {
  if (config.questionProvider === "gemini") console.warn("Gemini kullanılamadı; ortak yerel oda soru paketine geçildi.");
});
const activeGenerations = new Map<string, AbortController>();
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
    if (config.questionProvider === "gemini") console.warn("Gemini kullanılamadı; yerel soru sağlayıcısına geçildi.");
    return localFallback.generate(requestData.data, signal);
  }
}

const server = createServer(async (request, response) => {
  applyCors(request, response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }
  if (request.method === "GET" && request.url === "/health") {
    sendJson(response, 200, { status: "ok", provider: config.questionProvider, activeRoomCount: store.size });
    return;
  }
  if (!isAuthorized(request)) {
    sendJson(response, 401, { error: "Yetkisiz servis isteği." });
    return;
  }

  const url = new URL(request.url ?? "/", "http://request.invalid");
  const roomMatch = roomRoute.exec(url.pathname);
  const closeMatch = closeRoomRoute.exec(url.pathname);

  try {
    if (request.method === "POST" && url.pathname === "/questions/generate") {
      const validation = validateGenerateQuestionsRequest(await resolveReportInput(await readJson(request)));
      if (!validation.success) {
        sendJson(response, 400, { error: "Geçersiz istek.", details: validation.errors });
        return;
      }
      sendJson(response, 200, await produce(validation));
      return;
    }

    if (roomMatch && request.method === "POST") {
      const validation = validateRoomQuestionRequest(await resolveReportInput(await readJson(request)));
      if (!validation.success) {
        sendJson(response, 400, { error: "Geçersiz istek.", details: validation.errors });
        return;
      }
      const roomCode = roomMatch[1]!;
      const existing = roomQuestions.getQuestionsForRoom(roomCode);
      if (existing) {
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
      activeGenerations.set(key, controller);
      try {
        const questionSet = await roomQuestions.prepareQuestionsForRoom(roomCode, validation.data, controller.signal);
        sendJson(response, 201, questionSet);
      } finally {
        activeGenerations.delete(key);
      }
      return;
    }

    if (roomMatch && request.method === "GET") {
      if (!isSupportedRoomGame(url.searchParams.get("gameId") ?? "")) {
        sendJson(response, 400, { error: "Desteklenmeyen veya eksik oyun kimliği." });
        return;
      }
      const questionSet = roomQuestions.getQuestionsForRoom(roomMatch[1]!);
      sendJson(response, questionSet ? 200 : 404, questionSet ?? { error: "Oda için soru paketi bulunamadı." });
      return;
    }

    if (closeMatch && request.method === "DELETE") {
      const roomCode = closeMatch[1]!;
      const controller = activeGenerations.get(roomCode);
      if (controller) {
        controller.abort();
        activeGenerations.delete(roomCode);
      }
      lastGenerationAttempts.delete(roomCode);
      const deleted = roomQuestions.deleteRoom(roomCode);
      sendJson(response, 200, { deleted });
      return;
    }

    sendJson(response, 404, { error: "Endpoint bulunamadı." });
  } catch (error: unknown) {
    if (error instanceof ReportValidationError) {
      sendJson(response, 400, { error: error.message });
      return;
    }
    console.error("AI soru isteği güvenli biçimde sonlandırıldı.");
    sendJson(response, 500, { error: "İşlem tamamlanamadı." });
  }
});

server.listen(config.port, () => {
  console.log(`AI bot is listening on port ${config.port} in ${config.questionProvider} mode.`);
});
