import { selectSafeRespawn } from '../../domain/rules';
import type { Checkpoint } from '../map/mapTypes';

export class RespawnSystem {
  constructor(private readonly checkpoints: readonly Checkpoint[]) {}
  select(latestCheckpointId: string, dangerX: number) {
    return selectSafeRespawn(this.checkpoints, latestCheckpointId, dangerX);
  }
}
