export const gameplayConfig = {
  viewport: { width: 1280, height: 720 },
  shot: { minAngle: -35, maxAngle: 80, minPower: 220, maxPower: 620 },
  input: { moveRepeatMs: 110, authoritativeStep: 12, maxPredictionLead: 24 },
  movement: { smoothTimeMs: 70, maxFrameMs: 40 },
  explosionJump: {
    impulseRadius: 120,
    jumpForce: 400,
    horizontalForce: 110,
    maxVerticalSpeed: 280,
    maxHorizontalSpeed: 140,
    gravity: 360,
  },
} as const;
