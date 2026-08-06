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

export const generatedTextureManifest = [
  ...parallaxLayers.map((layer) => layer.key),
  'terrain-forest',
  'rocket',
  'platform',
  ...Array.from({ length: 4 }, (_, skin) => ['idle', 'run', 'jump', 'fall'].map((state) => `runner-${skin}-${state}`)).flat(),
] as const;
