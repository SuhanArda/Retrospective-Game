import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "./config.js";

test("demo mode needs no provider secret in development", () => {
  const config = loadConfig({ QUESTION_PROVIDER: "demo" });
  assert.equal(config.apiKey, null);
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
    () => loadConfig({ NODE_ENV: "production", QUESTION_PROVIDER: "demo" }),
    { message: "Missing required environment variable: ALLOWED_ORIGINS" },
  );
});

test("production accepts a comma-separated exact origin allowlist", () => {
  const config = loadConfig({
    NODE_ENV: "production",
    QUESTION_PROVIDER: "demo",
    ALLOWED_ORIGINS: "https://platform.example,https://game.example",
  });
  assert.deepEqual(config.allowedOrigins, ["https://platform.example", "https://game.example"]);
});

test("production rejects an insecure browser origin", () => {
  assert.throws(
    () => loadConfig({
      NODE_ENV: "production",
      QUESTION_PROVIDER: "demo",
      ALLOWED_ORIGINS: "http://platform.example",
    }),
    { message: "ALLOWED_ORIGINS must contain exact HTTPS origins in production." },
  );
});
