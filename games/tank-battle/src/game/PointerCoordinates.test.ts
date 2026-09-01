import { describe, expect, it, vi } from 'vitest';
import { pagePointerToWorld } from './PointerCoordinates';

describe('pagePointerToWorld', () => {
  it('uses Phaser scale and camera transforms for responsive world coordinates', () => {
    const scale = {
      transformX: vi.fn((pageX: number) => (pageX - 100) * 2),
      transformY: vi.fn((pageY: number) => (pageY - 40) * 3),
    };
    const camera = {
      getWorldPoint: vi.fn((canvasX: number, canvasY: number) => ({
        x: canvasX / 2 + 30,
        y: canvasY / 3 - 15,
      })),
    };

    expect(pagePointerToWorld(260, 140, scale, camera)).toEqual({ x: 190, y: 85 });
    expect(scale.transformX).toHaveBeenCalledWith(260);
    expect(scale.transformY).toHaveBeenCalledWith(140);
    expect(camera.getWorldPoint).toHaveBeenCalledWith(320, 300);
  });
});
