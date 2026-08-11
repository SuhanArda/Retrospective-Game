import type { AbilityId, Point } from '../../domain/types';

export interface Platform { id: string; x: number; y: number; width: number; height: number; moving?: { range: number; durationMs: number } }
export interface Checkpoint extends Point { id: string; label: string }
export interface AbilityPickup extends Point { id: string; ability: AbilityId }
export interface LevelDefinition {
  id: string;
  name: string;
  width: number;
  height: number;
  spawn: Point;
  platforms: readonly Platform[];
  checkpoints: readonly Checkpoint[];
  pickups: readonly AbilityPickup[];
  finish: { x: number; y: number; width: number; height: number };
}
