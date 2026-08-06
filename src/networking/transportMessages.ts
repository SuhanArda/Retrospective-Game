import type { AbilityId, ConnectionStatus, PlayerSnapshot } from '../domain/types';

export interface JoinRoomRequest { roomCode: string; playerName: string }
export interface PlayerInputMessage { sequence: number; left: boolean; right: boolean; jump: boolean; sentAt: number }
export interface UseAbilityCommand { abilityId: AbilityId; direction?: -1 | 1; clientTime: number }
export interface SelectTargetCommand { abilityId: 'ask'; targetPlayerId: string; clientTime: number }
export interface SubmitRetroAnswerCommand { questionId: string; value: string; skipped: boolean; clientTime: number }

export type ServerEvent =
  | { type: 'connection'; status: ConnectionStatus }
  | { type: 'roomJoined'; roomCode: string; players: readonly PlayerSnapshot[] }
  | { type: 'abilityAccepted'; abilityId: AbilityId }
  | { type: 'answerAccepted'; questionId: string }
  | { type: 'targetQuestioned'; playerId: string }
  | { type: 'error'; message: string };

export type GameTransportListener = (event: ServerEvent) => void;
