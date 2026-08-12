export type MatchState = 'LOADING' | 'WAITING' | 'COUNTDOWN' | 'RUNNING' | 'FINISHED' | 'ERROR';
export type PlayerState =
  | 'ACTIVE'
  | 'FALLEN'
  | 'ANSWERING_QUESTION'
  | 'RESPAWNING'
  | 'INVULNERABLE'
  | 'FINISHED'
  | 'DISCONNECTED';
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
export type RetroQuestionCategory =
  | 'Went well'
  | 'Challenges'
  | 'Improvement'
  | 'Appreciation'
  | 'Next sprint'
  | 'Team mood';
export type QuestionType = 'text' | 'singleChoice' | 'rating';
export type AbilityId = 'speed' | 'rocket' | 'ask';

export interface Point {
  x: number;
  y: number;
}

export interface RetroQuestion {
  id: string;
  category: RetroQuestionCategory;
  type: QuestionType;
  prompt: string;
  options?: readonly string[];
  required: boolean;
}

export interface PresentedRetroQuestion extends RetroQuestion {
  ownerPlayerId?: string;
  ownerName?: string;
  canConfirm: boolean;
}

export interface RetroAnswer {
  questionId: string;
  value: string;
  answeredAt: number;
}

export interface AbilityDefinition {
  id: AbilityId;
  name: string;
  targetMode: 'self' | 'direction' | 'player';
  cooldownMs: number;
  durationMs?: number;
  icon: string;
  description: string;
}

export interface PlayerSnapshot {
  id: string;
  name: string;
  state: PlayerState;
  isLocal: boolean;
  color: number;
  icon: string;
  checkpointId: string;
  eliminations: number;
  answers: number;
  finishPosition?: number;
}

export interface MatchSnapshot {
  state: MatchState;
  timeRemainingMs: number;
  countdown: number;
  players: readonly PlayerSnapshot[];
  checkpointLabel: string;
  danger: boolean;
  cooldowns: Readonly<Record<AbilityId, number>>;
}

export const playerTransitions: Readonly<Record<PlayerState, readonly PlayerState[]>> = {
  ACTIVE: ['FALLEN', 'ANSWERING_QUESTION', 'INVULNERABLE', 'FINISHED', 'DISCONNECTED'],
  FALLEN: ['ANSWERING_QUESTION', 'DISCONNECTED'],
  ANSWERING_QUESTION: ['RESPAWNING', 'DISCONNECTED'],
  RESPAWNING: ['INVULNERABLE', 'DISCONNECTED'],
  INVULNERABLE: ['ACTIVE', 'FINISHED', 'DISCONNECTED'],
  FINISHED: [],
  DISCONNECTED: ['RESPAWNING'],
};

export function transitionPlayer(current: PlayerState, next: PlayerState): PlayerState {
  if (!playerTransitions[current].includes(next)) {
    throw new Error(`Invalid player transition: ${current} -> ${next}`);
  }
  return next;
}
