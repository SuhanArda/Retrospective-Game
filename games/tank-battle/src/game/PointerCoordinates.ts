interface PhaserScaleCoordinates {
  transformX(pageX: number): number;
  transformY(pageY: number): number;
}

interface PhaserWorldCamera {
  getWorldPoint(x: number, y: number): { x: number; y: number };
}

export function pagePointerToWorld(
  pageX: number,
  pageY: number,
  scale: PhaserScaleCoordinates,
  camera: PhaserWorldCamera,
): { x: number; y: number } {
  const canvasX = scale.transformX(pageX);
  const canvasY = scale.transformY(pageY);
  const worldPoint = camera.getWorldPoint(canvasX, canvasY);
  return { x: worldPoint.x, y: worldPoint.y };
}
