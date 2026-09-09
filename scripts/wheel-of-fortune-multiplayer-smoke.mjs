import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr';

const apiUrl = process.env.RETRO_WHEEL_SMOKE_API_URL ?? 'http://127.0.0.1:5291';
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function request(path, body) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${path} returned ${response.status}: ${await response.text()}`);
  return response.json();
}

async function connect(admission) {
  const connection = new HubConnectionBuilder().withUrl(`${apiUrl}/hubs/room`).configureLogging(LogLevel.Error).build();
  await connection.start();
  const joined = await connection.invoke('RejoinRoom', admission.roomCode, admission.playerId, admission.reconnectToken);
  if (!joined.ok) throw new Error(`Rejoin failed: ${joined.error}`);
  return { connection, room: joined.room };
}

const host = await request('/api/rooms', {
  displayName: 'Host', color: '#f6c453', roomName: 'Wheel SignalR Smoke', maxParticipants: 10,
  questionTimeSeconds: 30, votingTimeSeconds: 15,
});
const guest = await request(`/api/rooms/${host.roomCode}/join`, { displayName: 'Guest', color: '#28c7c9' });
const hostClient = await connect(host);
let guestClient = await connect(guest);

try {
  await hostClient.connection.invoke('BeginGameSelection', ['wheel-of-fortune']);
  await Promise.all([hostClient.connection, guestClient.connection].map((client) => client.invoke('CastVote', 'wheel-of-fortune')));
  const room = await hostClient.connection.invoke('ResolveVote');
  const gameSessionId = room.currentGameSession?.gameSessionId;
  if (!gameSessionId || room.currentGameSession.gameId !== 'wheel-of-fortune') throw new Error('Wheel game did not start');

  const received = [];
  hostClient.connection.on('WheelOfFortuneStateChanged', (state) => { received.push(['host', state]); });
  guestClient.connection.on('WheelOfFortuneStateChanged', (state) => { received.push(['guest', state]); });
  await hostClient.connection.invoke('AddWheelQuestion', { gameSessionId, text: 'Ne iyi gitti?' });
  await hostClient.connection.invoke('AddWheelQuestion', { gameSessionId, text: 'Neyi değiştirelim?' });
  try {
    await guestClient.connection.invoke('AddWheelQuestion', { gameSessionId, text: 'Yetkisiz soru' });
    throw new Error('Guest question mutation unexpectedly succeeded');
  } catch (error) {
    if (error.message.includes('unexpectedly')) throw error;
  }
  await hostClient.connection.invoke('StartWheelGame', { gameSessionId });
  const playerSpin = await hostClient.connection.invoke('SpinWheelPlayer', { gameSessionId });
  if (!playerSpin.playerSpin || !playerSpin.selectedPlayerId) throw new Error('Player result was not authoritative');

  await wait(1_000);
  await guestClient.connection.stop();
  guestClient = await connect(guest);
  const resumed = guestClient.room.wheelOfFortuneState;
  if (resumed?.playerSpin?.spinId !== playerSpin.playerSpin.spinId || resumed.phase !== 'PLAYER_WHEEL_SPINNING')
    throw new Error('Reconnect did not resume the active player spin');

  await wait(3_200);
  const questionSpin = await hostClient.connection.invoke('SpinWheelQuestion', { gameSessionId });
  if (!questionSpin.questionSpin || !questionSpin.selectedQuestionId) throw new Error('Question result was not authoritative');
  await wait(4_200);
  const latestRoom = await hostClient.connection.invoke('GetRoom', host.roomCode);
  const final = latestRoom.wheelOfFortuneState;
  if (final?.phase !== 'QUESTION_REVEAL' || final.selectedPlayerId !== playerSpin.selectedPlayerId ||
      final.selectedQuestionId !== questionSpin.selectedQuestionId)
    throw new Error('Clients did not converge on one player and question');

  const hostSpins = received.filter(([client, state]) => client === 'host' && state.playerSpin?.spinId === playerSpin.playerSpin.spinId);
  if (hostSpins.length === 0) throw new Error('Authoritative state was not broadcast');
  process.stdout.write(`${JSON.stringify({ roomCode: host.roomCode, selectedPlayerId: final.selectedPlayerId,
    selectedQuestionId: final.selectedQuestionId, reconnectResumedSpin: true, result: 'passed' }, null, 2)}\n`);
} finally {
  for (const client of [guestClient.connection, hostClient.connection]) {
    try { await client.invoke('LeaveRoom'); } catch { /* room may already be closed */ }
    await client.stop();
  }
}
