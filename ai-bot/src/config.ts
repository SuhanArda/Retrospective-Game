export interface AppConfig {
  apiKey: string | null;
  model: string;
  questionProvider: "demo" | "gemini";
  port: number;
  allowedOrigins: "*" | readonly string[];
  sessionTtlMs: number;
  internalServiceKey: string | null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const rawApiKey = env.GEMINI_API_KEY?.trim() ?? "";
  const apiKey = rawApiKey && rawApiKey !== "your-api-key-here" ? rawApiKey : null;
  const questionProvider = env.QUESTION_PROVIDER?.trim().toLowerCase() || "demo";
  if (questionProvider !== "demo" && questionProvider !== "gemini") {
    throw new Error("QUESTION_PROVIDER yalnızca demo veya gemini olabilir.");
  }
  if (questionProvider === "gemini" && !apiKey) {
    throw new Error("Missing required environment variable: GEMINI_API_KEY");
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
  const internalServiceKey = rawServiceKey && rawServiceKey !== "your-internal-service-key-here"
    ? rawServiceKey
    : null;

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

  return {
    apiKey,
    model: env.GEMINI_MODEL?.trim() || "gemini-2.5-flash-lite",
    questionProvider,
    port,
    allowedOrigins,
    sessionTtlMs: ttlMinutes * 60_000,
    internalServiceKey,
  };
}
