import { describe, expect, it } from 'vitest';
import { ServerClock } from './serverClock';

describe('server clock', () => {
  it('uses the lowest-latency observed offset for synchronized progress', () => {
    const clock = new ServerClock();
    clock.observe(9_900, 10_000);
    clock.observe(10_050, 10_200);
    clock.observe(10_290, 10_400);
    expect(clock.now(11_000)).toBe(10_900);
  });
});
