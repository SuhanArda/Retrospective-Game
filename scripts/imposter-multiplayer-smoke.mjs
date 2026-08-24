import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr';

const apiUrl = process.env.RETRO_IMPOSTER_SMOKE_API_URL ?? 'http://127.0.0.1:5291';

async function request(path, method, body) {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${method} ${path} returned ${response.status}: ${await response.text()}`);
  return response.json();
}

async function connect(admission) {
  const connection = new HubConnectionBuilder()
    .withUrl(`${apiUrl}/hubs/room`)
    .configureLogging(LogLevel.Error)
    .build();
  await connection.start();
  const joined = await connection.invoke(
    'RejoinRoom',
    admission.roomCode,
    admission.playerId,
    admission.reconnectToken,
  );
  if (!joined.ok) throw new Error(`Rejoin failed: ${joined.error}`);
  return connection;
}

const host = await request('/api/rooms', 'POST', {
  displayName: 'Yağmur',
  color: '#654321',
  roomName: 'Imposter SignalR Smoke',
  maxParticipants: 10,
  questionTimeSeconds: 30,
  votingTimeSeconds: 15,
});
const firstGuest = await request(`/api/rooms/${host.roomCode}/join`, 'POST', {
  displayName: 'Ali',
  color: '#123456',
});
const secondGuest = await request(`/api/rooms/${host.roomCode}/join`, 'POST', {
  displayName: 'Ece',
  color: '#abcdef',
});

const participants = [host, firstGuest, secondGuest];
const connections = await Promise.all(participants.map(connect));
const byPlayerId = new Map(participants.map((participant, index) => [participant.playerId, connections[index]]));

try {
  await connections[0].invoke('BeginGameSelection', ['imposter']);
  await Promise.all(connections.map((connection) => connection.invoke('CastVote', 'imposter')));
  const room = await connections[0].invoke('ResolveVote');
  if (room.currentGameSession?.gameId !== 'imposter') throw new Error('Imposter did not become the active game');
  const gameSessionId = room.currentGameSession.gameSessionId;

  const roleViews = await Promise.all(connections.map((connection) => connection.invoke('GetImposterSnapshot', gameSessionId)));
  if (roleViews.filter((view) => view.yourRole === 'IMPOSTER').length !== 1)
    throw new Error('Exactly one private Imposter role was not assigned');
  if (roleViews.some((view) => view.yourRole === 'IMPOSTER' && view.secretWord))
    throw new Error('Secret word leaked to the Imposter');
  const crewWords = roleViews.filter((view) => view.yourRole === 'CREW').map((view) => view.secretWord);
  if (crewWords.length !== 2 || crewWords.some((word) => !word) || new Set(crewWords).size !== 1)
    throw new Error('Crew members did not receive one shared secret word');
  if (roleViews.some((view) => view.players.map((player) => player.displayName).join('|') !== 'Yağmur|Ali|Ece'))
    throw new Error('Room participant names were not preserved in the game');

  const backgroundChanges = connections.map((connection) => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Imposter background change was not broadcast')), 2_000);
    connection.on('ImposterStateChanged', (state) => {
      if (state.gameSessionId !== gameSessionId) return;
      clearTimeout(timeout);
      resolve(state);
    });
  }));
  await connections[0].invoke('SetImposterBackground', gameSessionId, 'beach');
  await Promise.all(backgroundChanges);
  const backgroundViews = await Promise.all(
    connections.map((connection) => connection.invoke('GetImposterSnapshot', gameSessionId)),
  );
  if (backgroundViews.some((view) => view.backgroundId !== 'beach'))
    throw new Error('Host background selection was not shared with every participant');

  await Promise.all(connections.map((connection) => connection.invoke('ReadyImposterRole', gameSessionId)));
  let snapshot = await connections[0].invoke('GetImposterSnapshot', gameSessionId);
  while (snapshot.phase === 'CLUE_GIVING') {
    const speaker = byPlayerId.get(snapshot.currentSpeakerPlayerId);
    if (!speaker) throw new Error('Current speaker was not a room participant');
    await speaker.invoke('CompleteImposterClue', gameSessionId);
    snapshot = await connections[0].invoke('GetImposterSnapshot', gameSessionId);
  }
  if (snapshot.phase !== 'VOTING') throw new Error(`Expected VOTING, received ${snapshot.phase}`);

  await Promise.all(participants.map((participant, index) => {
    const target = participants[(index + 1) % participants.length];
    return connections[index].invoke('CastImposterVote', {
      gameSessionId,
      targetPlayerId: target.playerId,
    });
  }));
  const results = await Promise.all(connections.map((connection) => connection.invoke('GetImposterSnapshot', gameSessionId)));
  if (results.some((view) => view.phase !== 'RESULTS' || !view.result || !view.secretWord || !view.retroQuestion))
    throw new Error('Shared result, word, or retrospective question was missing');
  if (new Set(results.map((view) => view.secretWord)).size !== 1)
    throw new Error('Players did not receive the same revealed word');

  process.stdout.write(`${JSON.stringify({
    roomCode: host.roomCode,
    players: results[0].players.map((player) => player.displayName),
    word: results[0].secretWord,
    question: results[0].retroQuestion,
    result: 'passed',
  }, null, 2)}\n`);
} finally {
  for (const connection of connections.toReversed()) {
    try { await connection.invoke('LeaveRoom'); } catch { /* room may already be closed */ }
    await connection.stop();
  }
}
