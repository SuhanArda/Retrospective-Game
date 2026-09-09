import { describe, expect, it } from 'vitest';
import { hasAiQuestionInput } from './RoomQuestionInput';

describe('room AI input routing', () => {
  it.each([undefined, null, '', ' ', '     '])('skips absent or blank sources (%s)', (value) => {
    expect(hasAiQuestionInput({ contextPrompt: value, reportText: value, reportFile: null })).toBe(false);
  });

  it('accepts a prompt, report text, or uploaded report independently', () => {
    expect(hasAiQuestionInput({ contextPrompt: '  Sprint iletişimi  ' })).toBe(true);
    expect(hasAiQuestionInput({ contextPrompt: ' ', reportText: '  Sprint report  ' })).toBe(true);
    expect(hasAiQuestionInput({ contextPrompt: null, reportFile: new File(['report'], 'retro.txt') })).toBe(true);
  });
});
