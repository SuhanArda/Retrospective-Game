// Local HTTP integration only. Uses the real backend and bot with the local
// provider; this is deliberately NOT evidence of production Gemini success.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const children = [];
const outputs = new Map();
const key = 'local-ai-smoke-key';
const coldStart = process.argv.includes('--cold-start');
const configuration = process.argv.includes('--release') ? 'Release' : 'Debug';

async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function start(label, command, args, cwd, env, port) {
  const child = spawn(command, args, { cwd, windowsHide: true, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  outputs.set(label, '');
  for (const stream of [child.stdout, child.stderr])
    stream.on('data', chunk => outputs.set(label, outputs.get(label) + chunk.toString()));
  let spawnError;
  child.on('error', error => { spawnError = error; });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (spawnError || child.exitCode !== null) throw new Error(`${label} failed to start`);
    try {
      if ((await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(200) })).ok) return;
    } catch { /* Bounded startup polling, checked below. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`${label} startup timed out`);
}

async function checkBackend(port, expectedStatus, checkAuth = false) {
  const base = `http://127.0.0.1:${port}`;
  for (const topic of [null, 'Sprint iletişimi ve geliştirme alanları']) {
    const admissionResponse = await fetch(`${base}/api/rooms`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Diagnostic Host', color: '#123456', roomName: 'AI diagnostic', maxParticipants: 2 }),
    });
    assert.equal(admissionResponse.status, 201);
    const admission = await admissionResponse.json();
    const headers = { 'Content-Type': 'application/json', 'X-Player-Id': admission.playerId, 'X-Reconnect-Token': admission.reconnectToken };
    const url = `${base}/api/rooms/${admission.roomCode}/ai/questions`;
    const response = await fetch(url, { method: 'POST', headers,
      body: JSON.stringify({ topic, reportText: null, reportFile: null, language: 'tr', style: 'dengeli', count: 20, replaceExisting: false }),
    });
    assert.ok(expectedStatus === 201 ? [200, 201].includes(response.status) : response.status === expectedStatus);
    const result = await response.json();
    if (expectedStatus === 201) {
      assert.equal(result.provider, 'demo');
      assert.equal(result.generationStatus, 'ready');
      assert.equal(result.questions.length, 20);
      assert.equal(result.roomInstanceId, admission.room.id);
    }
    console.log(`[Smoke] topicProvided=${Boolean(topic)} status=${response.status} count=${result.questions?.length ?? 0}`);
    if (checkAuth) {
      const rejected = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: 'diagnostic', language: 'tr', style: 'dengeli', count: 20 }) });
      assert.equal(rejected.status, 401);
      await rejected.arrayBuffer();
      const malformed = await fetch(url, { method: 'POST', headers, body: '{' });
      assert.equal(malformed.status, 400);
      await malformed.arrayBuffer();
    }
  }
}

try {
  const botPort = await freePort();
  const startBot = () => start('bot', process.execPath, ['dist/server.js'], path.join(root, 'ai-bot'), {
    NODE_ENV: 'production', AI_PROVIDER: 'local', GEMINI_API_KEY: '', INTERNAL_SERVICE_KEY: key,
    ALLOWED_ORIGINS: 'https://platform.example', PORT: String(botPort),
  }, botPort);
  if (!coldStart) await startBot();
  const serverDirectory = path.join(root, 'services/retrospective-server');
  const args = [path.join(serverDirectory, `bin/${configuration}/net10.0/retrospective-server.dll`)];
  const configuredPort = await freePort();
  await start('configured-backend', 'dotnet', args, serverDirectory, {
    ASPNETCORE_ENVIRONMENT: 'Development', DOTNET_ENVIRONMENT: 'Development', PORT: String(configuredPort),
    AiQuestions__BaseUrl: `http://127.0.0.1:${botPort}`, AiQuestions__InternalServiceKey: key,
  }, configuredPort);
  const startedAt = Date.now();
  await Promise.all([
    checkBackend(configuredPort, 201, true),
    coldStart ? (async () => {
      console.log('[Smoke] Backend running; ai-bot remains stopped for 12 seconds.');
      await new Promise(resolve => setTimeout(resolve, 12_000));
      assert.match(outputs.get('configured-backend'), /ai-bot not ready; waiting for cold start/);
      await startBot();
    })() : Promise.resolve(),
  ]);
  if (coldStart) {
    assert.ok(Date.now() - startedAt >= 12_000);
    assert.match(outputs.get('configured-backend'), /ai-bot ready after/);
    assert.equal(outputs.get('bot').match(/received method=POST route=\/rooms\/:code\/questions/g)?.length, 2);
    console.log(`[Smoke] Cold start passed in ${((Date.now() - startedAt) / 1000).toFixed(1)}s; one POST per room.`);
  }
  const missingPort = await freePort();
  await start('unconfigured-production-backend', 'dotnet', args, serverDirectory, {
    ASPNETCORE_ENVIRONMENT: 'Production', DOTNET_ENVIRONMENT: 'Production', PORT: String(missingPort),
    AllowedOrigins__0: 'https://platform.example', AiQuestions__BaseUrl: '', AiQuestions__InternalServiceKey: key,
  }, missingPort);
  await checkBackend(missingPort, 503);
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.match(outputs.get('bot'), /authenticated=true .*provider=local/);
  assert.match(outputs.get('configured-backend'), /invoking AiQuestionGateway/);
  assert.match(outputs.get('unconfigured-production-backend'), /request not sent operation=generation reason=base_url_missing/);
  assert.doesNotMatch(outputs.get('unconfigured-production-backend'), /calling ai-bot/);
  console.log('[Smoke] Local HTTP flow passed; production Gemini remains unverified.');
} finally {
  for (const [label, output] of outputs) {
    console.log(`[Smoke] ${label}`);
    for (const line of output.split(/\r?\n/).filter(line => /\[AI |\[QuestionBank\]/.test(line))) console.log(line.trim());
  }
  await Promise.all(children.map(async child => {
    if (child.exitCode !== null || !child.pid) return;
    const exited = once(child, 'exit');
    child.kill();
    await exited;
  }));
}
