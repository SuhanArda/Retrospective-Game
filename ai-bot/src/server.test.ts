import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("HTTP diagnostics cover auth failures and unmatched routes without exposing request data", { timeout: 20_000 }, async () => {
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const address = reservation.address();
  assert.ok(address && typeof address !== "string");
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  const child = spawn(process.execPath, ["--import", "tsx", fileURLToPath(new URL("server.ts", import.meta.url))], {
    windowsHide: true,
    env: { ...process.env, NODE_ENV: "production", AI_PROVIDER: "local", PORT: String(address.port),
      ALLOWED_ORIGINS: "https://platform.example", INTERNAL_SERVICE_KEY: "diagnostic-test-secret", GEMINI_API_KEY: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk: Buffer) => { output += chunk.toString(); });
  const base = `http://127.0.0.1:${address.port}`;
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error("AI HTTP test server exited before startup");
      if (output.includes("listening on port")) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.ok(output.includes("listening on port"));
    assert.deepEqual(await (await fetch(`${base}/health`)).json(), { status: "ok" });
    const payload = { roomInstanceId: "test-instance", topic: "private-topic-canary", language: "tr", style: "dengeli", count: 20 };
    const unauthorized = await fetch(`${base}/rooms/ABC234/questions`, { method: "POST", body: JSON.stringify(payload) });
    assert.equal(unauthorized.status, 401);
    await unauthorized.text();
    const headers = { "Content-Type": "application/json", "X-Internal-Service-Key": "diagnostic-test-secret" };
    const unmatched = await fetch(`${base}/wrong-route/private-path-canary?token=private-query-canary`, { method: "POST", headers });
    assert.equal(unmatched.status, 404);
    await unmatched.text();
    const generated = await fetch(`${base}/rooms/ABC234/questions`, { method: "POST", headers, body: JSON.stringify(payload) });
    assert.equal(generated.status, 201);
    const result = await generated.json() as { provider: string; questions: unknown[] };
    assert.equal(result.provider, "demo");
    assert.equal(result.questions.length, 20);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.match(output, /received method=POST route=\/rooms\/:code\/questions/u);
    assert.match(output, /authentication failed .*status=401/u);
    assert.match(output, /route=unmatched status=404/u);
    assert.match(output, /authenticated=true .*provider=local/u);
    assert.match(output, /completed source=local-fallback count=20/u);
    assert.match(output, /Gemini will not be invoked/u);
    for (const secret of ["diagnostic-test-secret", "private-topic-canary", "private-path-canary", "private-query-canary"])
      assert.ok(!output.includes(secret));
  } finally {
    if (child.exitCode === null) {
      const exited = once(child, "exit");
      child.kill();
      await exited;
    }
  }
});
