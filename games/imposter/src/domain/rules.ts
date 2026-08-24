import type { ImposterPlayer, ImposterRound, VoteResult, WordPack } from './types';

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 10;

function normalise(value: string): string {
  return value.trim().toLocaleLowerCase('tr-TR');
}

export function createRound(
  players: readonly ImposterPlayer[],
  pack: WordPack,
  roundNumber: number,
  randomValue: number,
): ImposterRound {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new Error('PLAYER_COUNT_OUT_OF_RANGE');
  }
  const safeRandom = Math.max(0, Math.min(randomValue, 0.999999));
  return {
    roundNumber,
    phase: 'ROLE_REVEAL',
    players: [...players],
    imposterId: players[Math.floor(safeRandom * players.length)]!.id,
    pack,
    speakerIndex: 0,
    clues: [],
    votes: {},
  };
}

export function beginClues(round: ImposterRound): ImposterRound {
  if (round.phase !== 'ROLE_REVEAL') throw new Error('INVALID_PHASE');
  return { ...round, phase: 'CLUE_GIVING' };
}

export function submitClue(round: ImposterRound, playerId: string, clue: string): ImposterRound {
  if (round.phase !== 'CLUE_GIVING') throw new Error('INVALID_PHASE');
  if (round.players[round.speakerIndex]?.id !== playerId) throw new Error('NOT_CURRENT_SPEAKER');
  const value = clue.trim();
  if (!value) throw new Error('EMPTY_CLUE');
  if (normalise(value).includes(normalise(round.pack.secretWord))) throw new Error('SECRET_WORD_USED');
  if (round.clues.some((entry) => normalise(entry.clue) === normalise(value))) throw new Error('DUPLICATE_CLUE');

  const clues = [...round.clues, { playerId, clue: value }];
  const allSpoke = clues.length === round.players.length;
  return {
    ...round,
    clues,
    speakerIndex: allSpoke ? round.speakerIndex : round.speakerIndex + 1,
    phase: allSpoke ? 'VOTING' : round.phase,
  };
}

export function completeSpokenClue(round: ImposterRound, playerId: string): ImposterRound {
  if (round.phase !== 'CLUE_GIVING') throw new Error('INVALID_PHASE');
  if (round.players[round.speakerIndex]?.id !== playerId) throw new Error('NOT_CURRENT_SPEAKER');
  const clues = [...round.clues, { playerId, clue: 'SPOKEN' }];
  const allSpoke = clues.length === round.players.length;
  return {
    ...round,
    clues,
    speakerIndex: allSpoke ? round.speakerIndex : round.speakerIndex + 1,
    phase: allSpoke ? 'VOTING' : round.phase,
  };
}

export function castVote(round: ImposterRound, voterId: string, targetId: string): ImposterRound {
  if (round.phase !== 'VOTING') throw new Error('INVALID_PHASE');
  if (voterId === targetId) throw new Error('SELF_VOTE');
  if (!round.players.some((player) => player.id === voterId) || !round.players.some((player) => player.id === targetId)) {
    throw new Error('UNKNOWN_PLAYER');
  }
  const votes = { ...round.votes, [voterId]: targetId };
  return {
    ...round,
    votes,
    phase: Object.keys(votes).length === round.players.length ? 'RESULTS' : round.phase,
  };
}

export function resolveVotes(round: ImposterRound): VoteResult {
  const totals = Object.values(round.votes).reduce<Record<string, number>>((result, playerId) => {
    result[playerId] = (result[playerId] ?? 0) + 1;
    return result;
  }, {});
  const highest = Math.max(0, ...Object.values(totals));
  const suspectedPlayerIds = Object.entries(totals)
    .filter(([, count]) => count === highest)
    .map(([playerId]) => playerId);
  return {
    suspectedPlayerIds,
    imposterCaught: suspectedPlayerIds.length === 1 && suspectedPlayerIds[0] === round.imposterId,
  };
}
