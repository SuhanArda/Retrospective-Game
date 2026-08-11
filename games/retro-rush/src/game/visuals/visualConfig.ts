export const forestPalette = {
  sky: 0xb8a6bd,
  mist: 0xd8c7bd,
  farTrees: 0x756779,
  midTrees: 0x4f4857,
  nearTrees: 0x302f35,
  earth: 0x6f3f32,
  earthDark: 0x3f2b2c,
  grass: 0xb27945,
  grassLight: 0xd29a57,
  stone: 0x665c5b,
  lantern: 0xf2bc66,
} as const;

export const parallaxLayers = [
  { key: 'forest-sky', factor: 0.02, depth: -40 },
  { key: 'forest-far', factor: 0.08, depth: -35 },
  { key: 'forest-mid', factor: 0.18, depth: -30 },
  { key: 'forest-near', factor: 0.32, depth: -25 },
] as const;

export const treeLayerConfig = {
  far: { baseline: 330, spacing: 140, xOffset: 0, canopyScale: 0.7, alpha: 0.55 },
  mid: { baseline: 300, spacing: 128, xOffset: 56, canopyScale: 0.82, alpha: 0.7 },
  near: { baseline: 290, spacing: 120, xOffset: 32, canopyScale: 0.95, alpha: 0.91 },
} as const;

export const skyBackgroundConfig = {
  mist: { y: 400, height: 320, alpha: 0.45 },
  cloudAlpha: 0.3,
  upperClouds: [
    { x: 72, y: 76, scale: 0.62 },
    { x: 178, y: 154, scale: 0.76 },
    { x: 292, y: 92, scale: 0.68 },
    { x: 402, y: 196, scale: 0.82 },
    { x: 514, y: 122, scale: 0.7 },
    { x: 578, y: 224, scale: 0.58 },
  ],
  midClouds: [
    { x: 88, y: 286, scale: 0.82 },
    { x: 236, y: 326, scale: 0.68 },
    { x: 394, y: 274, scale: 0.76 },
    { x: 548, y: 334, scale: 0.64 },
  ],
} as const;

export const generatedTextureManifest = [
  ...parallaxLayers.map((layer) => layer.key),
  'terrain-forest',
  'rocket',
  'platform',
  ...Array.from({ length: 4 }, (_, skin) => ['idle', 'run', 'jump', 'fall'].map((state) => `runner-${skin}-${state}`)).flat(),
] as const;
