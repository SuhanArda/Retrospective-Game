import { expect, it } from 'vitest';
import { collectPickup } from './PickupSystem';
it('collects a non-blocking overlap pickup exactly once', () => { const pickup = { active: true }; expect(collectPickup(pickup)).toBe(true); expect(collectPickup(pickup)).toBe(false); });
