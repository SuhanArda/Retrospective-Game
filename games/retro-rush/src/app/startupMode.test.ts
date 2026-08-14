import { describe, expect, it } from 'vitest';
import { shouldShowStandaloneStart } from './startupMode';

describe('Retro Rush startup mode', () => {
  it('never exposes the legacy start card during online initialization', () => {
    expect(shouldShowStandaloneStart(true, 'LOADING')).toBe(false);
    expect(shouldShowStandaloneStart(true, 'WAITING')).toBe(false);
    expect(shouldShowStandaloneStart(true, 'COUNTDOWN')).toBe(false);
  });

  it('preserves the intentional standalone start card', () => {
    expect(shouldShowStandaloneStart(false, 'WAITING')).toBe(true);
    expect(shouldShowStandaloneStart(false, 'RUNNING')).toBe(false);
  });
});
