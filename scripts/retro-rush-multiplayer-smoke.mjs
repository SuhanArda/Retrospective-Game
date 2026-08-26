import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const platformUrl = process.env.RETRO_PLATFORM_URL ?? 'http://localhost:5173';
const retroRushUrl = process.env.RETRO_RUSH_URL ?? 'http://localhost:5174';
// Warm Vite before the server creates the short round-start deadline. Otherwise
// first-request compilation can consume most of the countdown being tested.
await Promise.all([platformUrl, retroRushUrl].map(async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Smoke dependency ${url} returned ${response.status}`);
}));
const chromePath = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find(existsSync);
if (!chromePath) throw new Error('Chrome or Edge was not found');

const debuggingPort = 9234;
const profilePath = await mkdtemp(join(tmpdir(), 'retro-rush-multiplayer-'));
const chrome = spawn(chromePath, [
  '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
  '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
  '--use-angle=swiftshader', `--remote-debugging-port=${debuggingPort}`, `--user-data-dir=${profilePath}`, 'about:blank',
], { stdio: 'ignore', windowsHide: true });
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function browserSocket() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const version = await fetch(`http://127.0.0.1:${debuggingPort}/json/version`).then((response) => response.json());
      return new WebSocket(version.webSocketDebuggerUrl);
    } catch { await delay(100); }
  }
  throw new Error('Chrome DevTools endpoint did not start');
}

const socket = await browserSocket();
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
let nextId = 0;
const pending = new Map();
const runtimeErrors = [];
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(String(data));
  if (message.method === 'Runtime.exceptionThrown')
    runtimeErrors.push(message.params?.exceptionDetails?.exception?.description ?? message.params?.exceptionDetails?.text);
  if (!message.id) return;
  const handler = pending.get(message.id);
  if (!handler) return;
  pending.delete(message.id);
  if (message.error) handler.reject(new Error(message.error.message));
  else handler.resolve(message.result);
});
function send(method, params = {}, sessionId) {
  const id = ++nextId;
  socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
async function evaluate(context, expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, context.sessionId);
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
}
async function waitFor(context, expression, label, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { if (await evaluate(context, `Boolean(${expression})`)) return; } catch { /* navigation */ }
    await delay(100);
  }
  const diagnostic = await evaluate(context, `({ url: location.href, text: document.body?.innerText?.slice(0, 500), debug: window.__RETRO_RUSH_DEBUG__?.state() })`).catch(() => null);
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(diagnostic)}`);
}
async function createContext(name, color) {
  const { browserContextId } = await send('Target.createBrowserContext', { disposeOnDetach: true });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const context = { name, browserContextId, sessionId };
  await send('Runtime.enable', {}, sessionId);
  await send('Page.enable', {}, sessionId);
  await send('Page.navigate', { url: platformUrl }, sessionId);
  await waitFor(context, `document.readyState === 'complete'`, `${name} platform load`);
  await evaluate(context, `localStorage.setItem('op_user', JSON.stringify(${JSON.stringify({ name, color })}))`);
  return context;
}
async function navigate(context, url) {
  await send('Page.navigate', { url }, context.sessionId);
  await waitFor(context, `document.readyState === 'complete'`, `${context.name} navigation`);
}
async function setInput(context, selector, value) {
  await evaluate(context, `(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
}
async function click(context, expression, label) {
  await waitFor(context, expression, label);
  await evaluate(context, `(${expression}).click()`);
}
async function dispatchKey(context, type, key, code, keyCode) {
  await send('Input.dispatchKeyEvent', {
    type, key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode,
  }, context.sessionId);
}
async function setCountdownTestKeys(context, type) {
  await dispatchKey(context, type, 'ArrowRight', 'ArrowRight', 39);
  await dispatchKey(context, type, ' ', 'Space', 32);
  await dispatchKey(context, type, '1', 'Digit1', 49);
  await dispatchKey(context, type, '2', 'Digit2', 50);
  await dispatchKey(context, type, '3', 'Digit3', 51);
}
async function debug(context) { return evaluate(context, `window.__RETRO_RUSH_DEBUG__.state()`); }
async function localPlayer(context) { return (await debug(context)).players.find((player) => player.isLocal); }
async function eliminateLocalPlayer(context, label) {
  await waitFor(context, `window.__RETRO_RUSH_DEBUG__.state().players.find((player) => player.isLocal)?.state === 'FINISHED' || (window.__RETRO_RUSH_DEBUG__.setLocalPosition(134, 900), false)`, label);
}
async function assertCountdownLocked(host, guest, label, expectedDeadline, throughDeadline = false) {
  const before = { host: await debug(host), guest: await debug(guest) };
  if (before.host.matchState !== 'COUNTDOWN' || before.guest.matchState !== 'COUNTDOWN' ||
      !before.host.gameplayLocked || !before.guest.gameplayLocked)
    throw new Error(`${label}: both clients were not locked in COUNTDOWN`);
  if (before.host.roundStartAtUnixMs !== before.guest.roundStartAtUnixMs ||
      (expectedDeadline !== undefined && before.host.roundStartAtUnixMs !== expectedDeadline))
    throw new Error(`${label}: clients did not share one round start deadline`);
  const overlays = await Promise.all([
    evaluate(host, `document.querySelector('.phase-note')?.innerText ?? null`),
    evaluate(guest, `document.querySelector('.phase-note')?.innerText ?? null`),
  ]);
  if (!overlays.every((overlay) => overlay?.includes('PARKUR BAŞLIYOR')))
    throw new Error(`${label}: countdown overlay was not visible to both clients: ${JSON.stringify(overlays)}`);
  const observationMs = Math.min(500, before.host.roundStartAtUnixMs - Date.now() - 100);
  if (observationMs < 100) throw new Error(`${label}: insufficient countdown time remained for lock verification`);

  await setCountdownTestKeys(guest, 'keyDown');
  await evaluate(guest, `window.__RETRO_RUSH_DEBUG__.setMoveDirection(1); window.__RETRO_RUSH_DEBUG__.shove(); window.__RETRO_RUSH_DEBUG__.useAbility('speed'); window.__RETRO_RUSH_DEBUG__.useAbility('rocket'); window.__RETRO_RUSH_DEBUG__.useAbility('ask')`);
  await delay(observationMs);
  const after = { host: await debug(host), guest: await debug(guest) };
  for (const clientName of ['host', 'guest']) {
    const beforePlayers = before[clientName].players.map(({ id, x, y }) => ({ id, x, y }));
    const afterPlayers = after[clientName].players.map(({ id, x, y }) => ({ id, x, y }));
    if (JSON.stringify(beforePlayers) !== JSON.stringify(afterPlayers))
      throw new Error(`${label}: ${clientName} observed movement during countdown: ${JSON.stringify({ beforePlayers, afterPlayers })}`);
    if (after[clientName].networkSnapshotsSent !== before[clientName].networkSnapshotsSent)
      throw new Error(`${label}: ${clientName} sent a pre-start movement snapshot`);
  }
  if (throughDeadline) {
    await delay(Math.max(0, before.guest.roundStartAtUnixMs - Date.now() + 300));
    const held = { host: await debug(host), guest: await debug(guest) };
    const guestLocal = held.guest.players.find((player) => player.isLocal);
    const hostGuest = held.host.players.find((player) => player.id === before.guest.localPlayerId);
    for (const player of [guestLocal, hostGuest]) {
      if (!player || player.x !== before.guest.roundSpawn.x || player.y !== before.guest.roundSpawn.y ||
          player.velocityX !== 0 || player.velocityY !== 0)
        throw new Error(`${label}: held pre-start input moved the guest after unlock: ${JSON.stringify({ guestLocal, hostGuest })}`);
    }
    if (held.guest.rockets.length !== before.guest.rockets.length ||
        JSON.stringify(held.guest.ownedAbilities) !== JSON.stringify(before.guest.ownedAbilities))
      throw new Error(`${label}: a countdown ability was queued and executed after unlock`);

    await setCountdownTestKeys(guest, 'keyUp');
    await evaluate(guest, `window.__RETRO_RUSH_DEBUG__.setMoveDirection(0)`);
    await delay(200);
    const neutralPosition = await localPlayer(guest);
    if (neutralPosition.x !== before.guest.roundSpawn.x || neutralPosition.velocityX !== 0)
      throw new Error(`${label}: guest did not remain at spawn while countdown input rearmed`);

    await dispatchKey(guest, 'keyDown', 'ArrowRight', 'ArrowRight', 39);
    await waitFor(guest, `window.__RETRO_RUSH_DEBUG__.state().players.find((player) => player.isLocal).x > ${before.guest.roundSpawn.x + 20}`, 'fresh post-deadline guest movement');
    await dispatchKey(guest, 'keyUp', 'ArrowRight', 'ArrowRight', 39);
  } else {
    await setCountdownTestKeys(guest, 'keyUp');
    await evaluate(guest, `window.__RETRO_RUSH_DEBUG__.setMoveDirection(0)`);
  }
  return { deadline: before.host.roundStartAtUnixMs, overlays };
}

const contexts = [];
try {
  const host = await createContext('Arda', '#654321');
  const guest = await createContext('Ali', '#123456');
  const guest2 = await createContext('Ece', '#abcdef');
  contexts.push(host, guest, guest2);
  await navigate(host, `${platformUrl}/room/create`);
  await setInput(host, '#roomName', 'Retro Rush Browser Smoke');
  await setInput(host, '#roomPrompt', 'Senkronize tur başlangıcı doğrulaması');
  await evaluate(host, `(() => { const select = document.querySelector('#votingTime'); select.value = '15'; select.dispatchEvent(new Event('change', { bubbles: true })); document.querySelector('form').requestSubmit(); })()`);
  await waitFor(host, `/^\\/room\\/[A-Z0-9]{6}$/.test(location.pathname)`, 'room creation');
  const roomCode = await evaluate(host, `location.pathname.split('/').at(-1)`);

  await navigate(guest, `${platformUrl}/room/join`);
  await setInput(guest, '#code', roomCode);
  await setInput(guest, '#displayName', 'Ali');
  await evaluate(guest, `document.querySelector('form').requestSubmit()`);
  await waitFor(guest, `location.pathname === '/room/${roomCode}'`, 'guest join');
  await navigate(guest2, `${platformUrl}/room/join`);
  await setInput(guest2, '#code', roomCode);
  await setInput(guest2, '#displayName', 'Ece');
  await evaluate(guest2, `document.querySelector('form').requestSubmit()`);
  await waitFor(guest2, `location.pathname === '/room/${roomCode}'`, 'second guest join');
  await waitFor(host, `document.body.innerText.includes('Ali')`, 'room roster');
  await waitFor(host, `document.body.innerText.includes('Ece')`, 'three-player room roster');
  await click(host, `document.querySelector('.btn.btn-primary.btn-block')`, 'game selection');
  await waitFor(host, `location.pathname.endsWith('/games')`, 'host game selection route');
  await waitFor(guest, `location.pathname.endsWith('/games')`, 'guest game selection route');
  await waitFor(guest2, `location.pathname.endsWith('/games')`, 'second guest game selection route');
  const retroCard = `Array.from(document.querySelectorAll('.game-card')).find((button) => button.textContent.includes('Retro Rush'))`;
  await click(guest2, retroCard, 'second guest Retro Rush vote');
  await click(guest, retroCard, 'guest Retro Rush vote');
  await click(host, retroCard, 'host Retro Rush vote');
  await Promise.all([
    [host, 'host'], [guest, 'guest'], [guest2, 'second guest'],
  ].map(async ([context, label]) => {
    await waitFor(context, `location.origin === ${JSON.stringify(new URL(retroRushUrl).origin)} && window.__RETRO_RUSH_DEBUG__`, `${label} Retro Rush launch`, 30_000);
    await waitFor(context, `window.__RETRO_RUSH_DEBUG__.state().roundId === 1 && ['COUNTDOWN', 'RUNNING'].includes(window.__RETRO_RUSH_DEBUG__.state().matchState)`, `${label} initial round authority`);
  }));
  const launchStates = await Promise.all([host, guest, guest2].map(debug));
  if (!launchStates.every((state) => state.roundStartAtUnixMs === launchStates[0].roundStartAtUnixMs))
    throw new Error('Initial round deadline differs across three clients');
  const initialCountdown = { deadline: launchStates[0].roundStartAtUnixMs, overlays: 'cold boot validated by shared deadline' };
  await waitFor(host, `window.__RETRO_RUSH_DEBUG__.state().matchState === 'RUNNING' && window.__RETRO_RUSH_DEBUG__.state().players.length === 3`, 'host shared round');
  await waitFor(guest, `window.__RETRO_RUSH_DEBUG__.state().matchState === 'RUNNING' && window.__RETRO_RUSH_DEBUG__.state().players.length === 3`, 'guest shared round');
  await waitFor(guest2, `window.__RETRO_RUSH_DEBUG__.state().matchState === 'RUNNING' && window.__RETRO_RUSH_DEBUG__.state().players.length === 3`, 'second guest shared round');

  const initialHost = await debug(host);
  const initialGuest = await debug(guest);
  const initialGuest2 = await debug(guest2);
  if (initialHost.gameSessionId !== initialGuest.gameSessionId || initialHost.roundId !== initialGuest.roundId || initialHost.mapSeed !== initialGuest.mapSeed)
    throw new Error('Clients did not share session, round, and map seed');
  if (JSON.stringify(initialHost.chunks) !== JSON.stringify(initialGuest.chunks)) throw new Error('Initial map chunks differ');
  const playerIds = initialHost.players.map((player) => player.id).sort();
  if (JSON.stringify(playerIds) !== JSON.stringify(initialGuest.players.map((player) => player.id).sort())) throw new Error('Player identity maps differ');
  if (JSON.stringify(playerIds) !== JSON.stringify(initialGuest2.players.map((player) => player.id).sort())) throw new Error('Third client identity map differs');

  const playerRows = await evaluate(host, `Array.from(document.querySelectorAll('.player-row')).map((row) => row.innerText)`);
  if (playerRows.some((row) => /Ã|â—|◆|▲|●|■/.test(row))) throw new Error(`Player HUD contains a prefix glyph: ${JSON.stringify(playerRows)}`);

  const aliPlayerId = initialGuest.localPlayerId;
  const guestSnapshotsBeforeDisconnect = (await debug(guest)).networkSnapshotsSent;
  await evaluate(guest, `window.__RETRO_RUSH_DEBUG__.disconnect()`);
  await waitFor(host, `window.__RETRO_RUSH_DEBUG__.state().players.find((player) => player.id === ${JSON.stringify(aliPlayerId)})?.state === 'DISCONNECTED'`, 'Arda sees Ali disconnected');
  const disconnectedRow = await evaluate(host, `Array.from(document.querySelectorAll('.player-row')).find((row) => row.innerText.includes('Ali'))?.innerText`);
  if (!disconnectedRow || !/(DISCONNECTED|BAĞLANTI KESİLDİ)/.test(disconnectedRow) || /Ã|â—|◆|▲|●|■/.test(disconnectedRow))
    throw new Error(`Disconnected HUD row is incorrect: ${JSON.stringify(disconnectedRow)}`);
  await evaluate(guest, `window.__RETRO_RUSH_DEBUG__.reconnect()`);
  await waitFor(guest, `window.__RETRO_RUSH_DEBUG__?.state().networkSnapshotsSent > ${guestSnapshotsBeforeDisconnect + 2}`, 'Ali snapshot transmission resumes after reconnect');
  await waitFor(host, `window.__RETRO_RUSH_DEBUG__.state().players.find((player) => player.id === ${JSON.stringify(aliPlayerId)})?.state === 'ACTIVE'`, 'Arda sees Ali active again');

  async function verifyMovement(roundLabel) {
    const hostBefore = await localPlayer(host);
    await evaluate(host, `window.__RETRO_RUSH_DEBUG__.setMoveDirection(1)`);
    await waitFor(host, `window.__RETRO_RUSH_DEBUG__.state().players.find((player) => player.isLocal).x > ${hostBefore.x + 80}`, `${roundLabel}: Arda moves right`);
    await waitFor(guest, `window.__RETRO_RUSH_DEBUG__.state().players.find((player) => player.id === ${JSON.stringify(initialHost.localPlayerId)}).x > ${hostBefore.x + 80}`, `${roundLabel}: Ali sees Arda move`);
    await evaluate(host, `window.__RETRO_RUSH_DEBUG__.setMoveDirection(0)`);
    const guestBefore = await localPlayer(guest);
    await evaluate(guest, `window.__RETRO_RUSH_DEBUG__.setMoveDirection(1)`);
    await waitFor(guest, `window.__RETRO_RUSH_DEBUG__.state().players.find((player) => player.isLocal).x > ${guestBefore.x + 80}`, `${roundLabel}: Ali moves right`);
    await waitFor(host, `window.__RETRO_RUSH_DEBUG__.state().players.find((player) => player.id === ${JSON.stringify(initialGuest.localPlayerId)}).x > ${guestBefore.x + 80}`, `${roundLabel}: Arda sees Ali move`);
    await evaluate(guest, `window.__RETRO_RUSH_DEBUG__.setMoveDirection(0)`);
    await delay(2_000);
  }

  const round1CountersBefore = { host: await debug(host), guest: await debug(guest) };
  await verifyMovement('Round 1');
  const round1CountersAfter = { host: await debug(host), guest: await debug(guest) };

  await eliminateLocalPlayer(guest, 'Ali first elimination');
  await waitFor(host, `window.__RETRO_RUSH_DEBUG__.state().matchState === 'RUNNING' && !document.querySelector('.question-dialog')`, 'first elimination keeps round running');
  await waitFor(guest2, `window.__RETRO_RUSH_DEBUG__.state().matchState === 'RUNNING' && !document.querySelector('.question-dialog')`, 'remaining third client keeps playing');
  const roundAfterFirstElimination = await debug(host);
  if (roundAfterFirstElimination.roundId !== initialHost.roundId || roundAfterFirstElimination.mapSeed !== initialHost.mapSeed)
    throw new Error('First elimination changed round identity or map seed');

  await evaluate(guest, `window.__RETRO_RUSH_DEBUG__.disconnect()`);
  await waitFor(host, `window.__RETRO_RUSH_DEBUG__.state().players.find((player) => player.id === ${JSON.stringify(initialGuest.localPlayerId)})?.state === 'DISCONNECTED'`, 'eliminated Ali disconnect');
  await evaluate(guest, `window.__RETRO_RUSH_DEBUG__.reconnect()`);
  await waitFor(guest, `window.__RETRO_RUSH_DEBUG__.state().players.find((player) => player.isLocal)?.state === 'FINISHED'`, 'eliminated Ali remains eliminated after reconnect');

  await eliminateLocalPlayer(host, 'Arda second elimination');
  await waitFor(host, `document.querySelector('.results')`, 'Arda authoritative results');
  await waitFor(guest, `document.querySelector('.results')`, 'Ali authoritative results');
  await waitFor(guest2, `document.querySelector('.results')`, 'Ece authoritative results');
  const resultRows = await Promise.all([host, guest, guest2].map((context) =>
    evaluate(context, `Array.from(document.querySelectorAll('.authoritative-standings li')).map((row) => row.innerText)`)));
  const normalizedResultRows = resultRows.map((rows) => rows.map((row) => row.replace(' · Sen', '')));
  if (!normalizedResultRows.every((rows) => JSON.stringify(rows) === JSON.stringify(normalizedResultRows[0])) || resultRows[0].length !== 3)
    throw new Error(`Three clients did not receive the same ranking: ${JSON.stringify(resultRows)}`);
  await waitFor(guest, `document.querySelector('.question-dialog')`, 'Ali retrospective question');
  await waitFor(host, `document.querySelector('.question-dialog')`, 'Arda shared retrospective question');
  await waitFor(guest2, `document.querySelector('.question-dialog')`, 'Ece shared retrospective question');
  const sharedQuestion = {
    owner: await evaluate(guest, `Boolean(document.querySelector('.question-dialog'))`),
    observer: await evaluate(host, `Boolean(document.querySelector('.question-dialog'))`),
    ownerText: await evaluate(guest, `document.querySelector('.question-dialog')?.innerText`),
    observerText: await evaluate(host, `document.querySelector('.question-dialog')?.innerText ?? null`),
    ownerQuestionId: await evaluate(guest, `document.querySelector('.question-dialog')?.dataset.questionId`),
    observerQuestionId: await evaluate(host, `document.querySelector('.question-dialog')?.dataset.questionId`),
    ownerPlayerId: await evaluate(guest, `document.querySelector('.question-dialog')?.dataset.ownerPlayerId`),
    observerOwnerPlayerId: await evaluate(host, `document.querySelector('.question-dialog')?.dataset.ownerPlayerId`),
    ownerCanRestart: await evaluate(guest, `Boolean(document.querySelector('.question-dialog .button.primary'))`),
    observerCanRestart: await evaluate(host, `Boolean(document.querySelector('.question-dialog .button.primary'))`),
    secondObserverCanRestart: await evaluate(guest2, `Boolean(document.querySelector('.question-dialog .button.primary'))`),
  };
  if (sharedQuestion.ownerQuestionId !== sharedQuestion.observerQuestionId || sharedQuestion.ownerPlayerId !== sharedQuestion.observerOwnerPlayerId)
    throw new Error('Question identity or owner differs between clients');
  if (!sharedQuestion.ownerCanRestart || sharedQuestion.observerCanRestart || sharedQuestion.secondObserverCanRestart) throw new Error('Question restart authority is incorrect');
  const oldSeed = (await debug(host)).mapSeed;
  await click(guest, `document.querySelector('.question-dialog .button.primary')`, 'question owner restart');
  await waitFor(host, `window.__RETRO_RUSH_DEBUG__.state().roundId === 2 && window.__RETRO_RUSH_DEBUG__.state().matchState === 'COUNTDOWN'`, 'host authoritative round restart countdown');
  await waitFor(guest, `window.__RETRO_RUSH_DEBUG__.state().roundId === 2 && window.__RETRO_RUSH_DEBUG__.state().matchState === 'COUNTDOWN'`, 'guest authoritative round restart countdown');
  await waitFor(guest2, `window.__RETRO_RUSH_DEBUG__.state().roundId === 2 && window.__RETRO_RUSH_DEBUG__.state().matchState === 'COUNTDOWN'`, 'second guest authoritative round restart countdown');
  const restartedCountdown = await assertCountdownLocked(host, guest, 'Round 2 countdown');
  if (restartedCountdown.deadline === initialCountdown.deadline) throw new Error('Round restart reused a stale deadline');

  await waitFor(host, `window.__RETRO_RUSH_DEBUG__.state().matchState === 'RUNNING'`, 'host Round 2 running');
  await waitFor(guest, `window.__RETRO_RUSH_DEBUG__.state().matchState === 'RUNNING'`, 'guest Round 2 running');
  await waitFor(guest2, `window.__RETRO_RUSH_DEBUG__.state().matchState === 'RUNNING'`, 'second guest Round 2 running');
  await Promise.all([
    evaluate(host, `window.__RETRO_RUSH_DEBUG__.setMoveDirection(0)`),
    evaluate(guest, `window.__RETRO_RUSH_DEBUG__.setMoveDirection(0)`),
  ]);
  const restartedHost = await debug(host);
  const restartedGuest = await debug(guest);
  const restartedGuest2 = await debug(guest2);
  if (restartedHost.mapSeed === oldSeed || restartedHost.mapSeed !== restartedGuest.mapSeed || restartedHost.mapSeed !== restartedGuest2.mapSeed)
    throw new Error('Round restart seed was not new and shared');
  if (![restartedHost, restartedGuest, restartedGuest2].every((state) => state.players.length === 3 && state.players.every((player) => player.state === 'ACTIVE')))
    throw new Error('Round 2 did not restore all three players to active participation');
  if (![restartedHost, restartedGuest, restartedGuest2].every((state) => state.roundDeadlineAtUnixMs === restartedHost.roundDeadlineAtUnixMs))
    throw new Error('Round 2 timer deadline differs across three clients');

  const timerWaitMs = Math.max(20_000, restartedHost.roundDeadlineAtUnixMs - Date.now() + 20_000);
  await Promise.all([
    waitFor(host, `document.querySelector('.results') && window.__RETRO_RUSH_DEBUG__.state().gameplayLocked`, 'host timer results', timerWaitMs),
    waitFor(guest, `document.querySelector('.results') && window.__RETRO_RUSH_DEBUG__.state().gameplayLocked`, 'guest timer results', timerWaitMs),
    waitFor(guest2, `document.querySelector('.results') && window.__RETRO_RUSH_DEBUG__.state().gameplayLocked`, 'second guest timer results', timerWaitMs),
  ]);
  const timerResultRows = await Promise.all([host, guest, guest2].map((context) =>
    evaluate(context, `Array.from(document.querySelectorAll('.authoritative-standings li')).map((row) => row.innerText.replace(' · Sen', ''))`)));
  if (!timerResultRows.every((rows) => JSON.stringify(rows) === JSON.stringify(timerResultRows[0])) || timerResultRows[0].length !== 3)
    throw new Error(`Three clients did not receive the same timer ranking: ${JSON.stringify(timerResultRows)}`);
  if (runtimeErrors.length > 0) throw new Error(`Browser runtime errors: ${runtimeErrors.join(' | ')}`);

  process.stdout.write(JSON.stringify({
    result: 'passed', roomCode, gameSessionId: initialHost.gameSessionId,
    playerIds, initialRoundId: initialHost.roundId, initialMapSeed: initialHost.mapSeed,
    restartedRoundId: restartedHost.roundId, restartedMapSeed: restartedHost.mapSeed,
    playerRows, disconnectedRow,
    synchronizedCountdowns: { initialCountdown, restartedCountdown },
    resultRows, timerResultRows, sharedQuestion,
    snapshotDeltas: {
      round1HostSent: round1CountersAfter.host.networkSnapshotsSent - round1CountersBefore.host.networkSnapshotsSent,
      round1HostReceived: round1CountersAfter.host.networkSnapshotsReceived - round1CountersBefore.host.networkSnapshotsReceived,
      round1GuestSent: round1CountersAfter.guest.networkSnapshotsSent - round1CountersBefore.guest.networkSnapshotsSent,
      round1GuestReceived: round1CountersAfter.guest.networkSnapshotsReceived - round1CountersBefore.guest.networkSnapshotsReceived,
    },
    round2Players: { host: restartedHost.players, guest: restartedGuest.players, secondGuest: restartedGuest2.players },
    runtimeErrors: 0,
  }, null, 2));
} finally {
  for (const context of contexts) {
    try { await send('Target.disposeBrowserContext', { browserContextId: context.browserContextId }); } catch { /* closed */ }
  }
  socket.close();
  if (process.platform === 'win32' && chrome.pid) spawnSync('taskkill', ['/pid', String(chrome.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  else chrome.kill();
  await delay(200);
  await rm(profilePath, { recursive: true, force: true }).catch(() => undefined);
}
