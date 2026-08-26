import { describe, expect, it } from 'vitest';
import { RoundStartInputGate, type RoundStartGameplayInput } from './RoundStartInputGate';

const neutral: RoundStartGameplayInput = {
  left: false,
  right: false,
  jump: false,
  speedAbility: false,
  rocketAbility: false,
  pullAbility: false,
  developmentMovement: false,
};

describe('round-start input gate', () => {
  it.each([
    ['held movement', { right: true }],
    ['held jump', { jump: true }],
    ['held speed ability', { speedAbility: true }],
    ['held rocket ability', { rocketAbility: true }],
    ['held pull ability', { pullAbility: true }],
    ['held debug movement', { developmentMovement: true }],
  ] as const)('does not replay %s after the countdown', (_label, heldInput) => {
    const gate = new RoundStartInputGate();
    gate.lock();

    expect(gate.shouldSuppress({ ...neutral, ...heldInput })).toBe(true);
    expect(gate.shouldSuppress({ ...neutral, ...heldInput })).toBe(true);
    expect(gate.shouldSuppress(neutral)).toBe(true);
    expect(gate.shouldSuppress({ ...neutral, right: true })).toBe(false);
  });
});
