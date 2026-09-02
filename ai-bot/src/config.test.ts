import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "./config.js";
import { isAbsolute } from "node:path";

test("demo mode needs no provider secret in development", () => {
  const config = loadConfig({ QUESTION_PROVIDER: "demo" });
  assert.equal(config.apiKey, null);
  assert.equal(config.questionProvider, "local");
  assert.equal(config.allowedOrigins, "*");
});

test("gemini mode reports a missing key without exposing a value", () => {
  assert.throws(
    () => loadConfig({ QUESTION_PROVIDER: "gemini" }),
    { message: "Missing required environment variable: GEMINI_API_KEY" },
  );
});

test("production requires explicit CORS origins", () => {
  assert.throws(
    () => loadConfig({ NODE_ENV: "production", QUESTION_PROVIDER: "demo", INTERNAL_SERVICE_KEY: "test-service-key" }),
    { message: "Missing required environment variable: ALLOWED_ORIGINS" },
  );
});

test("production accepts a comma-separated exact origin allowlist", () => {
  const config = loadConfig({
    NODE_ENV: "production",
    QUESTION_PROVIDER: "demo",
    ALLOWED_ORIGINS: "https://platform.example,https://game.example",
    INTERNAL_SERVICE_KEY: "test-service-key",
  });
  assert.deepEqual(config.allowedOrigins, ["https://platform.example", "https://game.example"]);
});

test("production rejects an insecure browser origin", () => {
  assert.throws(
    () => loadConfig({
      NODE_ENV: "production",
      QUESTION_PROVIDER: "demo",
      ALLOWED_ORIGINS: "http://platform.example",
      INTERNAL_SERVICE_KEY: "test-service-key",
    }),
    { message: "ALLOWED_ORIGINS must contain exact HTTPS origins in production." },
  );
});

test("production requires a backend-to-backend service key", () => {
  assert.throws(
    () => loadConfig({ NODE_ENV: "production", QUESTION_PROVIDER: "demo", ALLOWED_ORIGINS: "https://platform.example" }),
    { message: "Missing required environment variable: INTERNAL_SERVICE_KEY" },
  );
});

test("room generation rate limit has a safe configurable range", () => {
  assert.equal(loadConfig({ QUESTION_PROVIDER: "demo" }).roomRateLimitMs, 5000);
  assert.throws(
    () => loadConfig({ QUESTION_PROVIDER: "demo", AI_ROOM_RATE_LIMIT_MS: "0" }),
    { message: "AI_ROOM_RATE_LIMIT_MS 1000-60000 arasında olmalıdır." },
  );
});

test("question bank path and size limit have safe defaults and validation", () => {
  const config = loadConfig({ QUESTION_PROVIDER: "demo" });
  assert.equal(isAbsolute(config.questionBankPath), true);
  assert.match(config.questionBankPath, /data[\\/]generated-question-bank\.json$/u);
  assert.equal(config.questionBankMaxItems, 1000);
  assert.throws(
    () => loadConfig({ QUESTION_PROVIDER: "demo", AI_QUESTION_BANK_MAX_ITEMS: "0" }),
    /AI_QUESTION_BANK_MAX_ITEMS/u,
  );
});
