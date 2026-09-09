import { resolve } from "node:path";

export interface AppConfig {
  apiKey: string | null;
  model: string;
  questionProvider: "local" | "gemini";
  port: number;
  allowedOrigins: "*" | readonly string[];
  internalServiceKey: string | null;
  requestTimeoutMs: number;
  maximumRetries: number;
  roomRateLimitMs: number;
  maxReportSizeBytes: number;
  questionBankPath: string;
  questionBankMaxItems: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const rawApiKey = env.GEMINI_API_KEY?.trim() ?? "";
  const apiKey = rawApiKey && rawApiKey !== "your-api-key-here" ? rawApiKey : null;
  const configuredProvider = (env.AI_PROVIDER ?? env.QUESTION_PROVIDER)?.trim().toLowerCase() || "local";
  const questionProvider = configuredProvider === "demo" ? "local" : configuredProvider;
  if (questionProvider !== "local" && questionProvider !== "gemini") {
    throw new Error("AI_PROVIDER yalnızca local veya gemini olabilir.");
  }
  if (questionProvider === "gemini" && !apiKey) {
    throw new Error("Missing required environment variable: GEMINI_API_KEY");
  }

  const rawPort = env.PORT ?? "3001";
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT 1 ile 65535 arasında bir tam sayı olmalıdır.");
  }

  const rawServiceKey = env.INTERNAL_SERVICE_KEY?.trim() ?? "";
  const internalServiceKey = rawServiceKey && rawServiceKey !== "your-internal-service-key-here"
    ? rawServiceKey
    : null;
  if (env.NODE_ENV === "production" && !internalServiceKey) {
    throw new Error("Missing required environment variable: INTERNAL_SERVICE_KEY");
  }

  const rawAllowedOrigins = env.ALLOWED_ORIGINS?.trim() || env.ALLOWED_ORIGIN?.trim() || "*";
  if (env.NODE_ENV === "production" && rawAllowedOrigins === "*") {
    throw new Error("Missing required environment variable: ALLOWED_ORIGINS");
  }
  const allowedOrigins = rawAllowedOrigins === "*"
    ? "*" as const
    : rawAllowedOrigins.split(",").map((origin) => {
        const value = origin.trim();
        let parsed: URL;
        try { parsed = new URL(value); }
        catch { throw new Error("ALLOWED_ORIGINS must contain exact HTTP or HTTPS origins."); }
        if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.origin !== value) {
          throw new Error("ALLOWED_ORIGINS must contain exact HTTP or HTTPS origins.");
        }
        if (env.NODE_ENV === "production" && parsed.protocol !== "https:") {
          throw new Error("ALLOWED_ORIGINS must contain exact HTTPS origins in production.");
        }
        return value;
      });
  if (allowedOrigins !== "*" && allowedOrigins.length === 0) {
    throw new Error("ALLOWED_ORIGINS must contain at least one origin.");
  }

  const requestTimeoutMs = Number(env.AI_REQUEST_TIMEOUT_MS ?? "30000");
  if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 1000 || requestTimeoutMs > 120_000)
    throw new Error("AI_REQUEST_TIMEOUT_MS 1000-120000 arasında olmalıdır.");
  const maximumRetries = Number(env.AI_MAX_RETRIES ?? "2");
  if (!Number.isInteger(maximumRetries) || maximumRetries < 0 || maximumRetries > 3)
    throw new Error("AI_MAX_RETRIES 0-3 arasında olmalıdır.");
  const roomRateLimitMs = Number(env.AI_ROOM_RATE_LIMIT_MS ?? "5000");
  if (!Number.isInteger(roomRateLimitMs) || roomRateLimitMs < 1000 || roomRateLimitMs > 60_000)
    throw new Error("AI_ROOM_RATE_LIMIT_MS 1000-60000 arasında olmalıdır.");
  const maxReportSizeMb = Number(env.MAX_REPORT_SIZE_MB ?? "5");
  if (!Number.isInteger(maxReportSizeMb) || maxReportSizeMb < 1 || maxReportSizeMb > 10)
    throw new Error("MAX_REPORT_SIZE_MB 1-10 arasında olmalıdır.");

  const rawQuestionBankPath = env.AI_QUESTION_BANK_PATH?.trim() || "./data/generated-question-bank.json";
  const questionBankMaxItems = Number(env.AI_QUESTION_BANK_MAX_ITEMS ?? "1000");
  if (!Number.isInteger(questionBankMaxItems) || questionBankMaxItems < 1 || questionBankMaxItems > 100_000) {
    throw new Error("AI_QUESTION_BANK_MAX_ITEMS must be an integer between 1 and 100000.");
  }

  return {
    apiKey,
    model: env.GEMINI_MODEL?.trim() || "gemini-3.1-flash-lite",
    questionProvider,
    port,
    allowedOrigins,
    internalServiceKey,
    requestTimeoutMs,
    maximumRetries,
    roomRateLimitMs,
    maxReportSizeBytes: maxReportSizeMb * 1024 * 1024,
    questionBankPath: resolve(rawQuestionBankPath),
    questionBankMaxItems,
  };
}
