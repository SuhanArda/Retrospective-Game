import { describe, expect, it } from 'vitest';
import { AbilityController } from './AbilityController';

describe('ability cooldown commitment', () => {
  it('does not consume cooldown when readiness is checked without a valid target', () => {
    const controller = new AbilityController();
    expect(controller.isReady('rocket', 100)).toBe(true);
    expect(controller.cooldowns(100).rocket).toBe(0);
    expect(controller.tryUse('rocket', 100)).toBe(true);
    expect(controller.cooldowns(100).rocket).toBeGreaterThan(0);
  });
});
