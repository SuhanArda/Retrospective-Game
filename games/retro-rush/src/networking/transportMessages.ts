import type { AbilityId, ConnectionStatus, PlayerSnapshot } from '../domain/types';
import type {
  RetroRushAbilityApplied,
  RetroRushGameSnapshot,
  RetroRushPlayerEliminated,
  RetroRushPlayerSnapshot,
  RetroRushRocketHitApplied,
  RetroRushRocketSnapshot,
  RetroRushShoveApplied,
} from '@retro-platform/contracts';

export interface JoinRoomRequest { roomCode: string; playerName: string }
export interface PlayerInputMessage { sequence: number; left: boolean; right: boolean; jump: boolean; sentAt: number }
export interface UseAbilityCommand { abilityId: AbilityId; direction?: -1 | 1; clientTime: number }
/**
 * Client shove intent. Mock play resolves it locally; production authority should
 * validate source state, cooldown, target eligibility/distance, velocity, and hit-stun.
 */
export interface ShoveCommand { sequence: number; clientTime: number }
/** Retained as a compatibility contract; elimination questions no longer submit written answers. */
export interface SubmitRetroAnswerCommand { questionId: string; value: string; skipped: boolean; clientTime: number }

export type ServerEvent =
  | { type: 'connection'; status: ConnectionStatus }
  | { type: 'roomJoined'; roomCode: string; players: readonly PlayerSnapshot[] }
  | { type: 'answerAccepted'; questionId: string }
  | { type: 'retroAbilityApplied'; ability: RetroRushAbilityApplied }
  | { type: 'retroSnapshot'; snapshot: RetroRushGameSnapshot }
  | { type: 'retroPlayerUpdated'; player: RetroRushPlayerSnapshot }
  | { type: 'retroShoveApplied'; shove: RetroRushShoveApplied }
  | { type: 'retroRocketSpawned'; rocket: RetroRushRocketSnapshot }
  | { type: 'retroRocketHit'; hit: RetroRushRocketHitApplied }
  | { type: 'retroPlayerEliminated'; elimination: RetroRushPlayerEliminated }
  | { type: 'retroRoundStarted'; snapshot: RetroRushGameSnapshot }
  | { type: 'error'; message: string };

export type GameTransportListener = (event: ServerEvent) => void;
