export type GamePhase = 'ROLE_REVEAL' | 'CLUE_GIVING' | 'VOTING' | 'RESULTS';

export interface ImposterPlayer {
  id: string;
  displayName: string;
  avatarIndex: number;
  isConnected: boolean;
}

export interface WordPack {
  category: string;
  secretWord: string;
  retroQuestion: string;
}

export interface ClueEntry {
  playerId: string;
  clue: string;
}

export interface ImposterRound {
  roundNumber: number;
  phase: GamePhase;
  players: readonly ImposterPlayer[];
  imposterId: string;
  pack: WordPack;
  speakerIndex: number;
  clues: readonly ClueEntry[];
  votes: Readonly<Record<string, string>>;
}

export interface VoteResult {
  suspectedPlayerIds: readonly string[];
  imposterCaught: boolean;
}
