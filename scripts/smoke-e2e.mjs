import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const chromeCandidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];
const chromePath = chromeCandidates.find(existsSync);
if (!chromePath) throw new Error('Chrome or Edge was not found');

const debuggingPort = 9223;
const profilePath = await mkdtemp(join(tmpdir(), 'retro-platform-smoke-'));
const chrome = spawn(chromePath, [
  '--headless=new',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-background-networking',
  '--use-angle=swiftshader',
  `--remote-debugging-port=${debuggingPort}`,
  `--user-data-dir=${profilePath}`,
  'about:blank',
], { stdio: 'ignore', windowsHide: true });

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function getPageTarget() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const targets = await fetch(`http://127.0.0.1:${debuggingPort}/json`).then((response) => response.json());
      const page = targets.find((target) => target.type === 'page');
      if (page) return page;
    } catch {
      // Chrome is still starting.
    }
    await delay(100);
  }
  throw new Error('Chrome DevTools endpoint did not start');
}

const target = await getPageTarget();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let nextId = 1;
const pending = new Map();
const runtimeErrors = [];

socket.addEventListener('message', (event) => {
  const message = JSON.parse(String(event.data));
  if (message.id) {
    const handler = pending.get(message.id);
    if (handler) {
      pending.delete(message.id);
      if (message.error) handler.reject(new Error(message.error.message));
      else handler.resolve(message.result);
    }
    return;
  }
  if (message.method === 'Runtime.exceptionThrown') {
    runtimeErrors.push(message.params.exceptionDetails.text);
  }
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
    runtimeErrors.push(`${message.params.entry.text} ${message.params.entry.url ?? ''}`.trim());
  }
});

function send(method, params = {}) {
  const id = nextId;
  nextId += 1;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) {
    const description = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text;
    throw new Error(description);
  }
  return result.result.value;
}

async function waitFor(expression, label) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await evaluate(`Boolean(${expression})`)) return;
    await delay(100);
  }
  const state = await evaluate("({ href: location.href, text: document.body.innerText.slice(0, 600) })");
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(state)}; errors=${runtimeErrors.join(' | ')}`);
}

const setInputValue = (selector, value) => `(() => {
  const input = document.querySelector(${JSON.stringify(selector)});
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(input, ${JSON.stringify(value)});
  input.dispatchEvent(new Event('input', { bubbles: true }));
})()`;

try {
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
  await waitFor("document.querySelector('.identity-modal input')", 'identity modal');
  await evaluate(setInputValue('.identity-modal input', 'Smoke Host'));
  await evaluate("document.querySelector('form.identity-modal').requestSubmit()");
  await waitFor("!document.querySelector('.identity-overlay')", 'identity acceptance');

  await evaluate("document.querySelector('.button-row .btn-primary').click()");
  await waitFor("location.pathname === '/room/create'", 'create-room route');
  await evaluate(setInputValue('#roomName', 'Smoke Retrospective'));
  await evaluate("document.querySelector('form.card').requestSubmit()");
  await waitFor("/^\\/room\\/[A-Z0-9]{6}$/.test(location.pathname)", 'room lobby');
  const roomCode = await evaluate("location.pathname.split('/').at(-1)");
  const lobbyText = await evaluate('document.body.innerText');
  if (!lobbyText.includes(roomCode) || !lobbyText.includes('Smoke Host')) throw new Error('Lobby did not render the host and room code');

  await evaluate("document.querySelector('.card .btn-primary').click()");
  await waitFor("location.pathname.endsWith('/games')", 'game selection');
  await waitFor("document.body.innerText.includes('Retro Rush')", 'Retro Rush game card');
  const selectionText = await evaluate('document.body.innerText');
  if (!selectionText.includes('Retro Rush')) throw new Error('Retro Rush was not listed');
  await evaluate("document.querySelector('.game-card .btn-primary').click()");

  await waitFor("location.port === '5174' && document.querySelector('.start-card')", 'Retro Rush launch');
  const gameText = await evaluate('document.body.innerText');
  if (!gameText.includes(`ROOM ${roomCode}`) || !gameText.includes('Return to Lobby')) {
    throw new Error('Retro Rush did not receive launch context');
  }
  await evaluate("document.querySelector('.return-to-platform').click()");
  await waitFor(`location.port === '5173' && location.pathname === '/room/${roomCode}'`, 'return to lobby');

  if (runtimeErrors.length > 0) throw new Error(`Browser runtime errors: ${runtimeErrors.join(' | ')}`);
  console.log(JSON.stringify({ roomCode, flow: 'create → lobby → games → retro-rush → lobby', runtimeErrors: 0 }));
} finally {
  socket.close();
  if (process.platform === 'win32' && chrome.pid) {
    spawnSync('taskkill', ['/pid', String(chrome.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  } else {
    chrome.kill();
  }
  await delay(300);
  await rm(profilePath, { recursive: true, force: true }).catch(() => undefined);
}
