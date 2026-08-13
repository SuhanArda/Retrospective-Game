export interface AppConfig {
  apiKey: string | null;
  model: string;
  questionProvider: "demo" | "gemini";
  port: number;
  allowedOrigin: string;
  sessionTtlMs: number;
  internalServiceKey: string | null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const rawApiKey = env.GEMINI_API_KEY?.trim() ?? "";
  const apiKey = rawApiKey && rawApiKey !== "Buraya Gemini Api Key" ? rawApiKey : null;
  const questionProvider = env.QUESTION_PROVIDER?.trim().toLowerCase() || "demo";
  if (questionProvider !== "demo" && questionProvider !== "gemini") {
    throw new Error("QUESTION_PROVIDER yalnızca demo veya gemini olabilir.");
  }

  const rawPort = env.PORT ?? "3001";
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT 1 ile 65535 arasında bir tam sayı olmalıdır.");
  }

  const ttlMinutes = Number(env.SESSION_TTL_MINUTES ?? "180");
  if (!Number.isInteger(ttlMinutes) || ttlMinutes < 5 || ttlMinutes > 1440) {
    throw new Error("SESSION_TTL_MINUTES 5 ile 1440 arasında olmalıdır.");
  }

  const rawServiceKey = env.INTERNAL_SERVICE_KEY?.trim() ?? "";
  const internalServiceKey = rawServiceKey && rawServiceKey !== "Buraya Servis Anahtarı"
    ? rawServiceKey
    : null;

  return {
    apiKey,
    model: env.GEMINI_MODEL?.trim() || "gemini-2.5-flash-lite",
    questionProvider,
    port,
    allowedOrigin: env.ALLOWED_ORIGIN?.trim() || "*",
    sessionTtlMs: ttlMinutes * 60_000,
    internalServiceKey,
  };
}
