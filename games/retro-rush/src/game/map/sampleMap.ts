import type { LevelDefinition, Platform } from './mapTypes';

const ground = (id: string, x: number, width: number): Platform => ({ id, x, y: 640, width, height: 40 });

export const sampleMap: LevelDefinition = {
  id: 'skyline-sprint', name: 'Skyline Sprint', width: 6800, height: 720, spawn: { x: 180, y: 540 },
  platforms: [
    ground('g1', 0, 980), ground('g2', 1120, 720), ground('g3', 1960, 880), ground('g4', 3000, 680),
    ground('g5', 3820, 940), ground('g6', 4920, 720), ground('g7', 5800, 1000),
    { id: 'p1', x: 520, y: 510, width: 180, height: 24 }, { id: 'p2', x: 820, y: 425, width: 170, height: 24 },
    { id: 'p3', x: 1270, y: 500, width: 180, height: 24 }, { id: 'p4', x: 1600, y: 430, width: 190, height: 24 },
    { id: 'p5', x: 2160, y: 500, width: 180, height: 24 }, { id: 'p6', x: 2540, y: 410, width: 210, height: 24 },
    { id: 'p7', x: 3180, y: 490, width: 200, height: 24, moving: { range: 100, durationMs: 2400 } },
    { id: 'p8', x: 3500, y: 405, width: 160, height: 24 }, { id: 'p9', x: 4010, y: 500, width: 180, height: 24 },
    { id: 'p10', x: 4420, y: 420, width: 180, height: 24 }, { id: 'p11', x: 5080, y: 500, width: 180, height: 24 },
    { id: 'p12', x: 5520, y: 410, width: 180, height: 24 }, { id: 'p13', x: 6020, y: 500, width: 210, height: 24 },
  ],
  checkpoints: [
    { id: 'start', label: 'Launch Pad', x: 180, y: 540 },
    { id: 'cp1', label: 'Idea Garden', x: 1450, y: 540 },
    { id: 'cp2', label: 'Team Bridge', x: 3150, y: 540 },
    { id: 'cp3', label: 'Focus Station', x: 4780, y: 540 },
    { id: 'cp4', label: 'Final Stretch', x: 5850, y: 540 },
  ],
  pickups: [
    { id: 'a1', ability: 'speed', x: 910, y: 370 }, { id: 'a2', ability: 'rocket', x: 2630, y: 350 },
    { id: 'a3', ability: 'speed', x: 4590, y: 360 },
  ],
  finish: { x: 6590, y: 390, width: 36, height: 250 },
};
