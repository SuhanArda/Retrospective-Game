import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { loadConfig } from "./config.js";
import { generateDemoQuestions } from "./services/demoQuestionGenerator.js";
import { generateQuestions } from "./services/questionGenerator.js";
import { RoomQuestionStore } from "./services/roomQuestionStore.js";
import { validateGenerateQuestionsRequest, validateRoomQuestionRequest } from "./validation/questionRequest.js";

const config = loadConfig();
const store = new RoomQuestionStore(config.sessionTtlMs);
const maximumBodySize = 32_768;
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
  return request.headers["x-internal-service-key"] === config.internalServiceKey;
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalSize = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalSize += buffer.length;
    if (totalSize > maximumBodySize) throw new Error("İstek gövdesi çok büyük.");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function produce(requestData: ReturnType<typeof validateGenerateQuestionsRequest> & { success: true }) {
  if (config.questionProvider === "gemini" && config.apiKey) {
    try {
      return await generateQuestions(requestData.data, config.apiKey, config.model);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Bilinmeyen Gemini hatası";
      console.warn(`Gemini kullanılamadı; demo havuzuna geçildi: ${message}`);
    }
  }
  return generateDemoQuestions(requestData.data);
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
      const validation = validateGenerateQuestionsRequest(await readJson(request));
      if (!validation.success) {
        sendJson(response, 400, { error: "Geçersiz istek.", details: validation.errors });
        return;
      }
      sendJson(response, 200, await produce(validation));
      return;
    }

    if (roomMatch && request.method === "POST") {
      const validation = validateRoomQuestionRequest(await readJson(request));
      if (!validation.success) {
        sendJson(response, 400, { error: "Geçersiz istek.", details: validation.errors });
        return;
      }
      const roomCode = roomMatch[1]!;
      const questionSet = store.set(roomCode, await produce(validation));
      sendJson(response, 201, questionSet);
      return;
    }

    if (roomMatch && request.method === "GET") {
      const questionSet = store.get(roomMatch[1]!);
      sendJson(response, questionSet ? 200 : 404, questionSet ?? { error: "Oda için soru paketi bulunamadı." });
      return;
    }

    if (closeMatch && request.method === "DELETE") {
      const deleted = store.delete(closeMatch[1]!);
      sendJson(response, 200, { deleted });
      return;
    }

    sendJson(response, 404, { error: "Endpoint bulunamadı." });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Bilinmeyen bir hata oluştu.";
    console.error(message);
    sendJson(response, 500, { error: "İşlem tamamlanamadı." });
  }
});

server.listen(config.port, () => {
  console.log(`AI bot is listening on port ${config.port} in ${config.questionProvider} mode.`);
});
