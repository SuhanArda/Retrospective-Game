import { describe, expect, it } from 'vitest';
import { generatedTextureManifest, parallaxLayers, skyBackgroundConfig, treeLayerConfig } from './visualConfig';

describe('forest visual configuration', () => {
  it('defines four ordered parallax layers with distinct speeds', () => {
    expect(parallaxLayers).toHaveLength(4);
    expect(new Set(parallaxLayers.map((layer) => layer.factor)).size).toBe(4);
    expect(parallaxLayers.every((layer, index) => index === 0 || layer.factor > parallaxLayers[index - 1]!.factor)).toBe(true);
  });

  it('has a unique generated texture manifest', () => {
    expect(new Set(generatedTextureManifest).size).toBe(generatedTextureManifest.length);
  });

  it('preserves tuned vertical baselines while staggering less-dense tree layers', () => {
    expect([treeLayerConfig.far.baseline, treeLayerConfig.mid.baseline, treeLayerConfig.near.baseline]).toEqual([330, 300, 290]);
    expect([treeLayerConfig.far.spacing, treeLayerConfig.mid.spacing, treeLayerConfig.near.spacing]).toEqual([140, 128, 120]);
    expect(new Set([treeLayerConfig.far.xOffset, treeLayerConfig.mid.xOffset, treeLayerConfig.near.xOffset]).size).toBe(3);
    expect(treeLayerConfig.far.canopyScale).toBeLessThan(treeLayerConfig.mid.canopyScale);
    expect(treeLayerConfig.mid.canopyScale).toBeLessThan(treeLayerConfig.near.canopyScale);
  });

  it('keeps clouds inside the texture edges and places more of them in the upper sky', () => {
    expect(skyBackgroundConfig.upperClouds.length).toBeGreaterThan(skyBackgroundConfig.midClouds.length);
    expect(skyBackgroundConfig.upperClouds.every((cloud) => cloud.y < 250)).toBe(true);
    expect([...skyBackgroundConfig.upperClouds, ...skyBackgroundConfig.midClouds].every((cloud) => cloud.x >= 60 && cloud.x <= 580)).toBe(true);
    expect(skyBackgroundConfig.mist).toEqual({ y: 400, height: 320, alpha: 0.45 });
  });
});
