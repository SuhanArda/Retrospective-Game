import { describe, expect, it } from 'vitest';
import { AbilityController } from './AbilityController';

describe('ability cooldown commitment', () => {
  it('makes every ability available after the shared initial round lock', () => {
    const controller = new AbilityController();
    controller.reset(7_100);
    expect(controller.tryUse('speed', 7_099)).toBe(false);
    expect(controller.tryUse('rocket', 7_099)).toBe(false);
    expect(controller.tryUse('pull', 7_099)).toBe(false);
    expect(controller.tryUse('speed', 7_100)).toBe(true);
    expect(controller.tryUse('rocket', 7_100)).toBe(true);
    expect(controller.tryUse('pull', 7_100)).toBe(true);
  });

  it('does not consume cooldown when readiness is checked without a valid target', () => {
    const controller = new AbilityController();
    expect(controller.isReady('rocket', 100)).toBe(true);
    expect(controller.cooldowns(100).rocket).toBe(0);
    expect(controller.tryUse('rocket', 100)).toBe(true);
    expect(controller.cooldowns(100).rocket).toBeGreaterThan(0);
  });

  it('restores authoritative cooldown deadlines on reconnect and clears them for a new round', () => {
    const controller = new AbilityController();
    controller.synchronize({ speed: 8_000, rocket: 10_000, pull: 12_000 });
    expect(controller.cooldowns(2_000)).toEqual({ speed: 6_000, rocket: 8_000, pull: 10_000 });
    controller.reset(20_000);
    expect(controller.cooldowns(13_000)).toEqual({ speed: 7_000, rocket: 7_000, pull: 7_000 });
  });
});
