const debuggerUrl = process.env.RETRO_CDP_URL ?? 'http://127.0.0.1:9222';
const platformUrl = process.env.RETRO_PLATFORM_URL ?? 'http://localhost:5173';
const apiUrl = process.env.RETRO_API_URL ?? 'http://localhost:5281';
const graceMs = Number(process.env.RETRO_DISCONNECT_GRACE_MS ?? 25_000);

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
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data);
  if (!message.id) return;
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (message.error) request.reject(new Error(message.error.message));
  else request.resolve(message.result);
});

function send(method, params = {}, sessionId) {
  const id = ++nextId;
  socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(context, expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  }, context.sessionId);
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function waitFor(check, label, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
    } catch {
      // Reloading briefly destroys the page's JavaScript execution context.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function waitForPage(context, expression, label, timeoutMs) {
  return waitFor(() => evaluate(context, expression), label, timeoutMs);
}

async function getRoom(roomCode) {
  const response = await fetch(`${apiUrl}/api/rooms/${roomCode}`);
  return response.ok ? response.json() : null;
}

async function waitForRoom(roomCode, predicate, label, timeoutMs) {
  return waitFor(async () => {
    const room = await getRoom(roomCode);
    return room && predicate(room) ? room : null;
  }, label, timeoutMs);
}

async function createContext(name, color) {
  const { browserContextId } = await send('Target.createBrowserContext', { disposeOnDetach: true });
  return openTarget({ name, color, browserContextId });
}

async function openTarget(context) {
  const { targetId } = await send('Target.createTarget', {
    url: 'about:blank',
    browserContextId: context.browserContextId,
  });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const next = { ...context, targetId, sessionId };
  await send('Runtime.enable', {}, sessionId);
  await send('Page.enable', {}, sessionId);
  await navigate(next, platformUrl);
  await evaluate(next, `localStorage.setItem('op_user', ${JSON.stringify(JSON.stringify({
    name: context.name,
    color: context.color,
  }))})`);
  return next;
}

async function navigate(context, url) {
  await send('Page.navigate', { url }, context.sessionId);
  await waitForPage(context, `document.readyState === 'complete'`, `${context.name} navigation`);
}

async function setInput(context, selector, value) {
  await evaluate(context, `(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
}

async function participantNames(context) {
  return evaluate(context, `Array.from(document.querySelectorAll('.participant-name'),
    (element) => element.textContent.replace(/\\s+/g, ' ').trim())`);
}

async function joinRoom(context, roomCode, displayName) {
  await navigate(context, `${platformUrl}/room/join`);
  await setInput(context, '#code', roomCode);
  await setInput(context, '#displayName', displayName);
  await evaluate(context, `document.querySelector('form').requestSubmit()`);
  await waitForPage(context, `location.pathname === '/room/${roomCode}'`, `${displayName} room join`);
  await waitForPage(context, `document.querySelector('.connection-status.connected') !== null`, `${displayName} SignalR attach`);
  return evaluate(context, `JSON.parse(sessionStorage.getItem('retro-platform.session'))`);
}

const contexts = [];
try {
  const host = await createContext('Arda', '#654321');
  let guest = await createContext('Ali', '#123456');
  contexts.push(host, guest);

  await navigate(host, `${platformUrl}/room/create`);
  await setInput(host, '#roomName', 'Disconnect Cleanup');
  await setInput(host, '#roomPrompt', 'Bağlantı temizleme testi');
  await evaluate(host, `document.querySelector('form').requestSubmit()`);
  await waitForPage(host, `location.pathname.startsWith('/room/') && location.pathname.split('/').pop().length === 6`, 'host room creation');
  await waitForPage(host, `document.querySelector('.connection-status.connected') !== null`, 'host SignalR attach');
  const roomCode = await evaluate(host, `location.pathname.split('/').pop()`);
  const hostSession = await evaluate(host, `JSON.parse(sessionStorage.getItem('retro-platform.session'))`);

  const firstGuestSession = await joinRoom(guest, roomCode, 'Ali');
  await waitFor(async () => (await participantNames(host)).some((name) => name.includes('Ali')), 'Ali visible in host lobby');

  // Refresh creates a replacement SignalR ConnectionId. The old disconnect
  // callback must not arm a timer that later removes this reattached player.
  await send('Page.reload', {}, guest.sessionId);
  await new Promise((resolve) => setTimeout(resolve, 200));
  await waitForPage(guest, `document.querySelector('.connection-status.connected') !== null`, 'guest refresh reconnect');
  const refreshedGuestSession = await evaluate(guest, `JSON.parse(sessionStorage.getItem('retro-platform.session'))`);
  if (refreshedGuestSession.playerId !== firstGuestSession.playerId) {
    throw new Error('Refresh changed the guest PlayerId');
  }
  await waitForRoom(roomCode, (room) => room.players.find((player) => player.id === firstGuestSession.playerId)?.isConnected,
    'refreshed guest marked connected');
  await new Promise((resolve) => setTimeout(resolve, graceMs + 1_000));
  const afterRefreshGrace = await getRoom(roomCode);
  if (!afterRefreshGrace?.players.some((player) => player.id === firstGuestSession.playerId)) {
    throw new Error('A stale disconnect timer removed the refreshed guest');
  }

  // A complete target close leaves the player visible but disconnected during
  // grace, then the maintenance broadcast removes the DOM row without reload.
  await send('Target.closeTarget', { targetId: guest.targetId });
  await waitForRoom(roomCode, (room) => room.players.find((player) => player.id === firstGuestSession.playerId)?.isConnected === false,
    'closed guest marked disconnected');
  if (!(await participantNames(host)).some((name) => name.includes('Ali'))) {
    throw new Error('Guest disappeared before reconnect grace elapsed');
  }
  await waitFor(async () => !(await participantNames(host)).some((name) => name.includes('Ali')),
    'guest removed from host lobby by broadcast', graceMs + 5_000);
  const afterGuestExpiry = await getRoom(roomCode);
  if (afterGuestExpiry?.players.some((player) => player.id === firstGuestSession.playerId)) {
    throw new Error('Expired guest remained in authoritative room state');
  }

  // Reuse the second browser context for a fresh membership, then close the
  // host and verify one deterministic transfer after its grace deadline.
  guest = await openTarget({ ...guest, name: 'Deniz', color: '#abcdef' });
  contexts[1] = guest;
  const secondGuestSession = await joinRoom(guest, roomCode, 'Deniz');
  await waitFor(async () => (await participantNames(host)).some((name) => name.includes('Deniz')), 'Deniz visible in host lobby');
  await send('Target.closeTarget', { targetId: host.targetId });

  const duringHostGrace = await waitForRoom(roomCode,
    (room) => room.hostPlayerId === hostSession.playerId &&
      room.players.find((player) => player.id === hostSession.playerId)?.isConnected === false,
    'host retained during grace');
  if (duringHostGrace.hostPlayerId !== hostSession.playerId) throw new Error('Host transferred before grace expired');

  const transferred = await waitForRoom(roomCode,
    (room) => room.hostPlayerId === secondGuestSession.playerId && room.players.length === 1,
    'single host transfer after expiry', graceMs + 5_000);
  await waitFor(async () => {
    const names = await participantNames(guest);
    return names.length === 1 && names[0].includes('Deniz') && names[0].includes('Oda Kurucusu');
  }, 'new host rendered without refresh', 5_000);
  await new Promise((resolve) => setTimeout(resolve, graceMs + 500));
  const stableTransfer = await getRoom(roomCode);
  if (stableTransfer?.hostPlayerId !== transferred.hostPlayerId || stableTransfer.players.filter((player) => player.isHost).length !== 1) {
    throw new Error('Host transfer was not stable and unique');
  }

  // Intentional leave is separate and immediate: no grace period and no room.
  await evaluate(guest, `Array.from(document.querySelectorAll('button'))
    .find((button) => button.textContent.toLocaleLowerCase('tr-TR').includes('odadan çık'))?.click()`);
  await waitFor(() => getRoom(roomCode).then((room) => room === null), 'explicit leave removes final membership immediately', 3_000);

  process.stdout.write(`${JSON.stringify({
    roomCode,
    graceMs,
    refreshPlayerIdStable: true,
    closedGuestRemovedWithoutReload: true,
    hostTransferredTo: secondGuestSession.playerId,
    hostCount: 1,
    explicitLeaveImmediate: true,
  }, null, 2)}\n`);
} finally {
  for (const context of contexts) {
    if (!context?.browserContextId) continue;
    await send('Target.disposeBrowserContext', { browserContextId: context.browserContextId }).catch(() => undefined);
  }
  socket.close();
}
