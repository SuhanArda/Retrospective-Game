import type Phaser from 'phaser';
import { forestPalette } from './visualConfig';

type PropType = 'lantern' | 'sign' | 'rocks' | 'bush' | 'bench';
interface PropPlacement { type: PropType; x: number; y: number }

export const forestProps: readonly PropPlacement[] = [
  { type: 'sign', x: 275, y: 620 }, { type: 'lantern', x: 440, y: 620 }, { type: 'bush', x: 735, y: 620 },
  { type: 'rocks', x: 1180, y: 620 }, { type: 'lantern', x: 1430, y: 620 }, { type: 'bench', x: 1740, y: 620 },
  { type: 'bush', x: 2250, y: 488 }, { type: 'lantern', x: 2600, y: 398 }, { type: 'rocks', x: 3060, y: 620 },
  { type: 'sign', x: 3270, y: 478 }, { type: 'bush', x: 3890, y: 620 }, { type: 'lantern', x: 4540, y: 408 },
  { type: 'bench', x: 5020, y: 620 }, { type: 'rocks', x: 5580, y: 398 }, { type: 'lantern', x: 5900, y: 620 },
  { type: 'sign', x: 6450, y: 620 },
] as const;

export class PropPlacementSystem {
  render(scene: Phaser.Scene) { forestProps.forEach((prop) => this.draw(scene, prop)); }

  private draw(scene: Phaser.Scene, prop: PropPlacement) {
    const graphics = scene.add.graphics().setDepth(2);
    if (prop.type === 'lantern') {
      graphics.fillStyle(forestPalette.lantern, 0.11).fillCircle(prop.x, prop.y - 73, 42);
      graphics.fillStyle(0x33272a).fillRect(prop.x - 3, prop.y - 72, 6, 72).fillRect(prop.x - 13, prop.y - 77, 26, 5);
      graphics.fillStyle(forestPalette.lantern).fillRect(prop.x - 9, prop.y - 70, 18, 18);
      graphics.fillStyle(0xffdda0).fillRect(prop.x - 5, prop.y - 66, 10, 10);
    } else if (prop.type === 'sign') {
      graphics.fillStyle(0x47302a).fillRect(prop.x - 3, prop.y - 60, 7, 60);
      graphics.fillStyle(0x805137).fillRect(prop.x - 24, prop.y - 65, 55, 24);
      graphics.fillStyle(0xc1854d).fillTriangle(prop.x + 31, prop.y - 65, prop.x + 43, prop.y - 53, prop.x + 31, prop.y - 41);
      graphics.fillStyle(0xd7a762).fillRect(prop.x - 17, prop.y - 59, 35, 3);
    } else if (prop.type === 'rocks') {
      graphics.fillStyle(0x4b4445).fillTriangle(prop.x - 25, prop.y, prop.x - 12, prop.y - 24, prop.x + 4, prop.y);
      graphics.fillStyle(0x716565).fillTriangle(prop.x - 5, prop.y, prop.x + 12, prop.y - 31, prop.x + 31, prop.y);
      graphics.fillStyle(0x95817a).fillRect(prop.x + 8, prop.y - 24, 7, 4);
    } else if (prop.type === 'bush') {
      graphics.fillStyle(0x4c4a32).fillCircle(prop.x - 18, prop.y - 11, 17).fillCircle(prop.x + 2, prop.y - 18, 22).fillCircle(prop.x + 24, prop.y - 10, 16);
      graphics.fillStyle(0x78603a).fillRect(prop.x - 24, prop.y - 17, 8, 5).fillRect(prop.x + 4, prop.y - 27, 8, 5);
    } else {
      graphics.fillStyle(0x4a3029).fillRect(prop.x - 32, prop.y - 27, 64, 9).fillRect(prop.x - 27, prop.y - 15, 6, 15).fillRect(prop.x + 21, prop.y - 15, 6, 15);
      graphics.fillStyle(0x9a633c).fillRect(prop.x - 29, prop.y - 25, 58, 3);
    }
  }
}
