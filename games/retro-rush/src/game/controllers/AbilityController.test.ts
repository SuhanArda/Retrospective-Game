import { describe, expect, it } from 'vitest';
import { AbilityController } from './AbilityController';

describe('ability cooldown commitment', () => {
  it('starts empty and ignores every ability until the matching pickup grants it', () => {
    const controller = new AbilityController();
    expect(controller.ownedAbilities()).toEqual([]);
    expect(controller.tryUse('speed', 100)).toBe(false);
    expect(controller.tryUse('rocket', 100)).toBe(false);
    expect(controller.tryUse('ask', 100)).toBe(false);

    controller.grant('rocket');
    expect(controller.ownedAbilities()).toEqual(['rocket']);
    expect(controller.tryUse('speed', 100)).toBe(false);
    expect(controller.tryUse('rocket', 100)).toBe(true);
  });

  it('does not consume cooldown when readiness is checked without a valid target', () => {
    const controller = new AbilityController();
    controller.grant('rocket');
    expect(controller.isReady('rocket', 100)).toBe(true);
    expect(controller.cooldowns(100).rocket).toBe(0);
    expect(controller.tryUse('rocket', 100)).toBe(true);
    expect(controller.cooldowns(100).rocket).toBeGreaterThan(0);
  });

  it('clears ownership on round reset and restores it for a same-round reconnect', () => {
    const controller = new AbilityController();
    controller.grant('ask');
    controller.reset();
    expect(controller.ownedAbilities()).toEqual([]);
    controller.restore(['ask']);
    expect(controller.isReady('ask', 100)).toBe(true);
  });
});
