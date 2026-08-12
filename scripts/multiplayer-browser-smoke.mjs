import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const debuggerUrl = process.env.RETRO_CDP_URL ?? 'http://127.0.0.1:9222';
const platformUrl = process.env.RETRO_PLATFORM_URL ?? 'http://localhost:5173';
const retroRushUrl = process.env.RETRO_RUSH_URL ?? 'http://localhost:5174';
const spinTheBottleUrl = process.env.RETRO_SPIN_URL ?? 'http://localhost:5175';
const apiUrl = process.env.RETRO_API_URL ?? 'http://localhost:5281';
const artifactDir = process.env.RETRO_SMOKE_ARTIFACT_DIR;

if (artifactDir) await mkdir(artifactDir, { recursive: true });

const version = await fetch(`${debuggerUrl}/json/version`).then((response) => {
  if (!response.ok) throw new Error(`Chrome DevTools endpoint returned ${response.status}`);
  return response.json();
});
const socket = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let nextId = 0;
const pending = new Map();
const runtimeErrors = [];
const signalRFrames = [];
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data);
  if (message.method === 'Runtime.exceptionThrown') {
    runtimeErrors.push(message.params?.exceptionDetails?.exception?.description ?? message.params?.exceptionDetails?.text);
  }
  if (message.method === 'Network.webSocketFrameReceived') {
    signalRFrames.push({ sessionId: message.sessionId, payload: message.params?.response?.payloadData ?? '' });
  }
  if (!message.id) return;
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (message.error) request.reject(new Error(`${message.error.message}: ${JSON.stringify(message.error.data ?? {})}`));
  else request.resolve(message.result);
});

function send(method, params = {}, sessionId) {
  const id = ++nextId;
  socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(sessionId, expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

function visiblyRenderedExpression(selector) {
  return `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 &&
      rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 &&
      rect.top < innerHeight && rect.left < innerWidth;
  })()`;
}

async function captureScreenshot(context, label) {
  if (!artifactDir) return;
  const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, context.sessionId);
  const filename = `${context.name}-${label}`.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
  await writeFile(join(artifactDir, `${filename}.png`), Buffer.from(result.data, 'base64'));
}

async function waitFor(sessionId, expression, label, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await evaluate(sessionId, expression)) return;
    } catch {
      // A navigation briefly destroys the old execution context.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  let diagnostic = 'unavailable';
  try {
    diagnostic = JSON.stringify(await evaluate(sessionId, `({
      url: location.href,
      text: document.body?.innerText?.slice(0, 600),
      session: sessionStorage.getItem('retro-platform.session'),
      gameSession: sessionStorage.getItem('retro-platform.game-session'),
      roomConnection: document.querySelector('main')?.dataset?.roomConnection,
      activeGameSession: document.querySelector('main')?.dataset?.gameSession,
      requests: performance.getEntriesByType('resource').map((entry) => entry.name).filter((name) => name.includes('5281')).slice(-10),
      runtimeErrors: ${JSON.stringify(runtimeErrors)}.slice(-10),
    })`));
  } catch { /* keep the original timeout */ }
  throw new Error(`Timed out waiting for ${label}: ${diagnostic}`);
}

async function waitForRuntimeSnapshot(context, roomCode, condition, label) {
  return evaluate(context.sessionId, `(async () => {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const response = await fetch(${JSON.stringify(`${apiUrl}/api/rooms/${roomCode}`)});
      if (response.ok) {
        const room = await response.json();
        if (${condition}) return {
          status: room.status,
          votingTimeSeconds: room.votingTimeSeconds,
          votingStartedAt: room.votingStartedAt,
          votingEndsAt: room.votingEndsAt,
          votes: room.votes,
          candidateGameIds: room.candidateGameIds,
          selectedGameId: room.selectedGameId,
          currentGameSession: room.currentGameSession,
          spinBottleState: room.spinBottleState,
        };
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(${JSON.stringify(`Timed out waiting for ${label}`)});
  })()`);
}

async function createContext(name, color) {
  const { browserContextId } = await send('Target.createBrowserContext', { disposeOnDetach: true });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Runtime.enable', {}, sessionId);
  await send('Network.enable', {}, sessionId);
  await send('Page.enable', {}, sessionId);
  await send('Page.navigate', { url: platformUrl }, sessionId);
  await waitFor(sessionId, 'document.readyState === "complete"', `${name} platform load`);
  await evaluate(sessionId, `localStorage.setItem('op_user', JSON.stringify(${JSON.stringify({ name, color })}))`);
  return { name, browserContextId, targetId, sessionId };
}

async function navigate(context, url) {
  await send('Page.navigate', { url }, context.sessionId);
  await waitFor(context.sessionId, 'document.readyState === "complete"', `${context.name} navigation`);
}

async function setInput(context, selector, value) {
  await evaluate(context.sessionId, `(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
}

async function click(context, expression, label) {
  await waitFor(context.sessionId, `Boolean(${expression})`, label);
  const clicked = await evaluate(context.sessionId, `(() => {
    const target = ${expression};
    if (!target) return false;
    target.click();
    return true;
  })()`);
  if (!clicked) return click(context, expression, label);
}

async function observeCountdown(context, targetOrigin, label, expectedDuration) {
  const values = new Set();
  const deadline = Date.now() + (expectedDuration + 10) * 1000;
  while (Date.now() < deadline) {
    const observation = await evaluate(context.sessionId, `({
      origin: location.origin,
      countdown: document.querySelector('[data-testid="game-selection-countdown"]')?.textContent,
      visible: ${visiblyRenderedExpression('[data-testid="game-selection-countdown"]')},
    })`).catch(() => null);
    const value = Number.parseInt(observation?.countdown ?? '', 10);
    if (observation?.visible && Number.isInteger(value) && value > 0 && !values.has(value)) {
      values.add(value);
      await captureScreenshot(context, `${label}-${value}`);
    }
    if (observation?.origin === targetOrigin) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  for (const expected of [expectedDuration, expectedDuration - 1, expectedDuration - 2]) {
    if (!values.has(expected)) throw new Error(`${label} missed ${expected}; observed ${[...values].join(',')}`);
  }
  return [...values];
}

async function waitForQuestion(context, label) {
  await waitFor(context.sessionId, `${visiblyRenderedExpression('.challenge-card')} && document.querySelector('.challenge-type')?.textContent.includes('SORUSU')`, label, 10_000);
  await captureScreenshot(context, label);
  return evaluate(context.sessionId, `({
    id: document.querySelector('.challenge-card')?.dataset.questionId,
    text: document.querySelector('.challenge-text')?.textContent,
    owner: document.querySelector('.challenge-card')?.dataset.questionOwner,
  })`);
}

const contexts = [];
try {
  const host = await createContext('Arda', '#654321');
  const guest = await createContext('Ali', '#123456');
  contexts.push(host, guest);

  await navigate(host, `${platformUrl}/room/create`);
  await setInput(host, '#roomName', 'Browser Multiplayer');
  await evaluate(host.sessionId, `(() => {
    const select = document.querySelector('#votingTime');
    select.value = '15';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await evaluate(host.sessionId, `document.querySelector('form').requestSubmit()`);
  await waitFor(host.sessionId, `(() => { const code = location.pathname.split('/').pop(); return code.length === 6 && [...code].every((character) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.includes(character)); })()`, 'host room creation');
  const roomCode = await evaluate(host.sessionId, `location.pathname.split('/').pop()`);

  await navigate(guest, `${platformUrl}/room/join`);
  await setInput(guest, '#code', roomCode);
  await setInput(guest, '#displayName', 'Ali');
  await evaluate(guest.sessionId, `document.querySelector('form').requestSubmit()`);
  await waitFor(guest.sessionId, `location.pathname === '/room/${roomCode}'`, 'guest room join');
  await waitFor(host.sessionId, `document.body.innerText.includes('Ali')`, 'guest in host participant list');
  await waitFor(guest.sessionId, `document.body.innerText.includes('Arda')`, 'host in guest participant list');

  await click(host, `document.querySelector('.btn.btn-primary.btn-block')`, 'host choose-game action');
  await waitFor(host.sessionId, `location.pathname.endsWith('/games')`, 'host game selection');
  await waitFor(guest.sessionId, `location.pathname.endsWith('/games')`, 'guest follows game selection');
  const guestCanVote = await evaluate(guest.sessionId, `Array.from(document.querySelectorAll('.game-card')).some((button) => !button.disabled)`);
  if (!guestCanVote) throw new Error('Guest was not allowed to vote for a game');

  await click(host, `Array.from(document.querySelectorAll('.game-card')).find((button) => button.textContent.includes('Spin the Bottle'))`, 'Spin the Bottle card');
  await click(guest, `Array.from(document.querySelectorAll('.game-card')).find((button) => button.textContent.includes('Spin the Bottle'))`, 'Ali Spin the Bottle vote');
  const [hostSpinCountdown, guestSpinCountdown, hostSpinSelection, guestSpinSelection] = await Promise.all([
    observeCountdown(host, spinTheBottleUrl, 'Arda Spin selection countdown', 15),
    observeCountdown(guest, spinTheBottleUrl, 'Ali Spin selection countdown', 15),
    waitForRuntimeSnapshot(host, roomCode, `room.status === 'GAME_SELECTION' && room.votingEndsAt`, 'Arda Spin selection snapshot'),
    waitForRuntimeSnapshot(guest, roomCode, `room.status === 'GAME_SELECTION' && room.votingEndsAt`, 'Ali Spin selection snapshot'),
  ]);
  await waitFor(host.sessionId, `document.body.innerText.includes('Ali')`, 'Spin participant synchronization');

  async function resolveCurrentQuestion(ownerContext) {
    await click(ownerContext, `document.querySelector('.work-button')`, 'question category');
    await click(ownerContext, `document.querySelector('.done-button')`, 'question continue');
    await waitForQuestion(ownerContext, 'question activation');
    await click(ownerContext, `document.querySelector('.done-button')`, 'question complete');
    await waitFor(host.sessionId, `document.querySelector('.challenge-card') === null`, 'host question resolved');
    await waitFor(guest.sessionId, `document.querySelector('.challenge-card') === null`, 'guest question resolved');
  }

  async function spinUntil(targetName) {
    for (let attempt = 0; attempt < 12; attempt++) {
      await click(host, `document.querySelector('.spin-button')`, `spin for ${targetName}`);
      await waitFor(host.sessionId, `document.querySelector('.challenge-card') !== null`, 'host shared choice', 10_000);
      await waitFor(guest.sessionId, `document.querySelector('.challenge-card') !== null`, 'guest shared choice', 10_000);
      const hostTarget = await evaluate(host.sessionId, `document.querySelector('.player-row.active strong')?.textContent`);
      const guestTarget = await evaluate(guest.sessionId, `document.querySelector('.player-row.active strong')?.textContent`);
      if (hostTarget !== guestTarget) throw new Error(`Target mismatch: ${hostTarget} != ${guestTarget}`);
      if (hostTarget === targetName) {
        if (!(await evaluate(host.sessionId, visiblyRenderedExpression('.challenge-card'))) ||
            !(await evaluate(guest.sessionId, visiblyRenderedExpression('.challenge-card')))) {
          throw new Error(`Shared category state was not visibly rendered for ${targetName}`);
        }
        await Promise.all([
          captureScreenshot(host, `${targetName}-category-state`),
          captureScreenshot(guest, `${targetName}-category-state`),
        ]);
        return;
      }
      await resolveCurrentQuestion(hostTarget === 'Arda' ? host : guest);
    }
    throw new Error(`Did not select ${targetName} within 12 authoritative spins`);
  }

  await spinUntil('Ali');
  const choiceSnapshot = await waitForRuntimeSnapshot(
    host,
    roomCode,
    `room.spinBottleState?.status === 'CHOICE'`,
    'authoritative category choice snapshot',
  );
  const aliHasControls = await evaluate(guest.sessionId, `!document.querySelector('.work-button').disabled`);
  const ardaHasControls = await evaluate(host.sessionId, `!document.querySelector('.work-button').disabled`);
  if (!aliHasControls || ardaHasControls) throw new Error('Question category ownership did not belong exclusively to Ali');

  await click(guest, `document.querySelector('.work-button')`, 'Ali question category');
  await waitFor(host.sessionId, `document.querySelector('.done-button') === null`, 'Arda read-only confirmation');
  await click(guest, `document.querySelector('.done-button')`, 'Ali question continue');
  const [ardaQuestionA, aliQuestionA] = await Promise.all([
    waitForQuestion(host, 'Arda sees Ali question'),
    waitForQuestion(guest, 'Ali sees owned question'),
  ]);
  if (ardaQuestionA.id !== aliQuestionA.id || ardaQuestionA.text !== aliQuestionA.text)
    throw new Error('Initial question did not match across browsers');
  const activeQuestionSnapshot = await waitForRuntimeSnapshot(
    host,
    roomCode,
    `room.spinBottleState?.status === 'QUESTION_ACTIVE'`,
    'authoritative active question snapshot',
  );
  const unauthorizedPassVisible = await evaluate(host.sessionId, `document.querySelector('.pass-button') !== null`);
  if (unauthorizedPassVisible) throw new Error('Arda received Pass controls for Ali question');

  await click(guest, `document.querySelector('.pass-button')`, 'Ali passes question');
  await waitFor(guest.sessionId, `document.querySelector('.challenge-card')?.dataset.questionId !== ${JSON.stringify(aliQuestionA.id)}`, 'Ali replacement question');
  const [ardaQuestionB, aliQuestionB] = await Promise.all([
    waitForQuestion(host, 'Arda sees replacement question'),
    waitForQuestion(guest, 'Ali sees replacement question'),
  ]);
  if (ardaQuestionB.id !== aliQuestionB.id || ardaQuestionB.text !== aliQuestionB.text || aliQuestionB.id === aliQuestionA.id)
    throw new Error('Passed question was not one shared authoritative replacement');
  await click(guest, `document.querySelector('.done-button')`, 'Ali completes question');
  await waitFor(host.sessionId, `document.querySelector('.challenge-card') === null`, 'Arda question closed');
  await waitFor(guest.sessionId, `document.querySelector('.challenge-card') === null`, 'Ali question closed');

  await spinUntil('Arda');
  await click(host, `document.querySelector('.work-button')`, 'Arda question category');
  await click(host, `document.querySelector('.done-button')`, 'Arda question continue');
  const ardaOwnedQuestion = await waitForQuestion(host, 'Arda owned question');
  const aliCanPassArdaQuestion = await evaluate(guest.sessionId, `document.querySelector('.pass-button') !== null`);
  if (aliCanPassArdaQuestion) throw new Error('Ali received controls for Arda question');
  const hostAngle = await evaluate(host.sessionId, `document.querySelector('.milk-bottle').style.transform`);
  const guestAngle = await evaluate(guest.sessionId, `document.querySelector('.milk-bottle').style.transform`);
  if (hostAngle !== guestAngle) throw new Error(`Spin mismatch: ${hostAngle} != ${guestAngle}`);
  await send('Page.reload', {}, guest.sessionId);
  const aliRecoveredQuestion = await waitForQuestion(guest, 'Ali reconnect question recovery');
  if (aliRecoveredQuestion.id !== ardaOwnedQuestion.id || aliRecoveredQuestion.text !== ardaOwnedQuestion.text)
    throw new Error('Reconnected Ali did not recover Arda current question');
  if (await evaluate(guest.sessionId, `document.querySelector('.pass-button') !== null`))
    throw new Error('Reconnected Ali gained question controls');

  await click(host, `document.querySelector('.back-to-games-button')`, 'host room-wide back');
  await waitFor(host.sessionId, `location.origin === '${platformUrl}' && location.pathname.endsWith('/games')`, 'host returns to selection', 20_000);
  await waitFor(guest.sessionId, `location.origin === '${platformUrl}' && location.pathname.endsWith('/games')`, 'guest follows host back', 20_000);

  await click(host, `Array.from(document.querySelectorAll('.game-card')).find((button) => button.textContent.includes('Retro Rush'))`, 'Retro Rush card');
  await click(guest, `Array.from(document.querySelectorAll('.game-card')).find((button) => button.textContent.includes('Retro Rush'))`, 'Ali Retro Rush vote');
  const [hostRetroCountdown, guestRetroCountdown, hostRetroSelection, guestRetroSelection] = await Promise.all([
    observeCountdown(host, retroRushUrl, 'Arda Retro Rush selection countdown', 15),
    observeCountdown(guest, retroRushUrl, 'Ali Retro Rush selection countdown', 15),
    waitForRuntimeSnapshot(host, roomCode, `room.status === 'GAME_SELECTION' && room.votingEndsAt`, 'Arda Retro Rush selection snapshot'),
    waitForRuntimeSnapshot(guest, roomCode, `room.status === 'GAME_SELECTION' && room.votingEndsAt`, 'Ali Retro Rush selection snapshot'),
  ]);
  await waitFor(host.sessionId, `document.querySelector('main[data-map-seed]') !== null`, 'host Retro Rush game session');
  await waitFor(guest.sessionId, `document.querySelector('main[data-map-seed]') !== null`, 'guest Retro Rush game session');

  const signalREvents = Object.fromEntries([host, guest].map((context) => [
    context.name,
    {
      gameStarted: signalRFrames.filter((frame) => frame.sessionId === context.sessionId && frame.payload.includes('GameStarted')).length,
      spinBottleStateChanged: signalRFrames.filter((frame) => frame.sessionId === context.sessionId && frame.payload.includes('SpinBottleStateChanged')).length,
    },
  ]));

  process.stdout.write(JSON.stringify({
    roomCode,
    countdowns: { spin: { Arda: hostSpinCountdown, Ali: guestSpinCountdown }, retroRush: { Arda: hostRetroCountdown, Ali: guestRetroCountdown } },
    selectionSnapshots: {
      spin: { Arda: hostSpinSelection, Ali: guestSpinSelection },
      retroRush: { Arda: hostRetroSelection, Ali: guestRetroSelection },
    },
    choiceSnapshot,
    activeQuestionSnapshot,
    signalREvents,
    questions: { initial: aliQuestionA, replacement: aliQuestionB, reconnected: aliRecoveredQuestion },
    hostAngle,
    guestAngle,
    result: 'passed',
  }, null, 2));
} finally {
  for (const context of contexts) {
    try { await send('Target.disposeBrowserContext', { browserContextId: context.browserContextId }); } catch { /* already closed */ }
  }
  socket.close();
}
