export interface ViewportCoverage {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export function calculateViewportCoverage(
  viewportWidth: number,
  viewportHeight: number,
  mapWidth: number,
  mapHeight: number,
  bleed: number,
): ViewportCoverage {
  const visibleWidth = Math.max(viewportWidth, mapWidth);
  const visibleHeight = Math.max(viewportHeight, mapHeight);
  const left = (mapWidth - visibleWidth) / 2 - bleed;
  const top = (mapHeight - visibleHeight) / 2 - bleed;
  const right = left + visibleWidth + bleed * 2;
  const bottom = top + visibleHeight + bleed * 2;
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

export function calculateCameraTargetX(localX: number, viewportWidth: number, mapWidth: number): number {
  if (mapWidth <= viewportWidth) return mapWidth / 2;
  const halfWidth = viewportWidth / 2;
  return Math.max(halfWidth, Math.min(mapWidth - halfWidth, localX));
}
