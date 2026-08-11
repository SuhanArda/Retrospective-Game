import type Phaser from 'phaser';
import type { GeneratedChunk } from '../systems/ProceduralMapGenerator';

export class ChunkDebugRenderer {
  render(scene: Phaser.Scene, chunk: GeneratedChunk): Phaser.GameObjects.GameObject[] {
    const visuals: Phaser.GameObjects.GameObject[] = [];
    const boundaryHeight = 440;
    visuals.push(
      scene.add.rectangle(chunk.startX, 150, 2, boundaryHeight, 0x5de4c7, 0.8).setOrigin(0, 0).setDepth(14),
      scene.add.rectangle(chunk.endX, 150, 2, boundaryHeight, 0xffd166, 0.8).setOrigin(0, 0).setDepth(14),
      scene.add.text(chunk.startX + 8, 164, `${chunk.index}: ${chunk.templateId}`, { fontFamily: 'monospace', fontSize: '12px', color: '#5de4c7', stroke: '#1d1720', strokeThickness: 3 }).setDepth(15),
      scene.add.circle(chunk.entryAnchor.x, chunk.entryAnchor.y, 7, 0x5de4c7, 0.9).setDepth(15),
      scene.add.circle(chunk.exitAnchor.x, chunk.exitAnchor.y, 7, 0xffd166, 0.9).setDepth(15),
    );
    for (const platform of chunk.platforms) {
      const routeLabel = platform.mandatory ? 'MAIN' : 'OPTIONAL';
      visuals.push(scene.add.text(platform.x + 8, platform.y - platform.height / 2 - 20, `P${platform.templateIndex} ${routeLabel}`, {
        fontFamily: 'monospace', fontSize: '10px', color: platform.mandatory ? '#8ff5dc' : '#dfb7ff', stroke: '#1d1720', strokeThickness: 3,
      }).setDepth(15));
    }
    return visuals;
  }
}
