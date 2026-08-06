import { describe, expect, it } from 'vitest';
import { generatedTextureManifest, parallaxLayers } from './visualConfig';

describe('forest visual configuration', () => {
  it('defines four ordered parallax layers with distinct speeds', () => {
    expect(parallaxLayers).toHaveLength(4);
    expect(new Set(parallaxLayers.map((layer) => layer.factor)).size).toBe(4);
    expect(parallaxLayers.every((layer, index) => index === 0 || layer.factor > parallaxLayers[index - 1]!.factor)).toBe(true);
  });

  it('has a unique generated texture manifest', () => {
    expect(new Set(generatedTextureManifest).size).toBe(generatedTextureManifest.length);
  });
});
