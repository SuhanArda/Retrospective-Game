import { describe, expect, it } from 'vitest';
import { ServerClock } from './ServerClock';

describe('ServerClock', () => {
  it('uses the best observed server offset without accumulating network delay', () => {
    const clock = new ServerClock();
    clock.observe(9_900, 10_000);
    clock.observe(10_050, 10_200);
    clock.observe(10_290, 10_400);
    expect(clock.now(11_000)).toBe(10_900);
  });
});
