import { describe, expect, it } from 'vitest';
import { abilityDefinitions } from '../data/abilityDefinitions';
import { canRocketHit, canUseAbility, isBehindCamera, isEligibleTarget, selectSafeRespawn, validateQuestionResponse } from './rules';
import { transitionPlayer, type PlayerSnapshot, type RetroQuestion } from './types';
import { sampleMap } from '../game/map/sampleMap';

const player = (overrides: Partial<PlayerSnapshot> = {}): PlayerSnapshot => ({
  id: 'ada', name: 'Ada', state: 'ACTIVE', isLocal: false, color: 0, icon: '▲', checkpointId: 'start', eliminations: 0, answers: 0, ...overrides,
});

describe('player state transitions', () => {
  it('allows the elimination and respawn path', () => {
    expect(transitionPlayer('ACTIVE', 'FALLEN')).toBe('FALLEN');
    expect(transitionPlayer('FALLEN', 'ANSWERING_QUESTION')).toBe('ANSWERING_QUESTION');
    expect(transitionPlayer('ANSWERING_QUESTION', 'RESPAWNING')).toBe('RESPAWNING');
    expect(transitionPlayer('RESPAWNING', 'INVULNERABLE')).toBe('INVULNERABLE');
  });
  it('rejects an invalid transition', () => expect(() => transitionPlayer('FINISHED', 'ACTIVE')).toThrow());
});

describe('ability rules', () => {
  it('enforces cooldown completion', () => {
    expect(canUseAbility(abilityDefinitions.speed, undefined, 100)).toBe(true);
    expect(canUseAbility(abilityDefinitions.speed, 100, 15_099)).toBe(false);
    expect(canUseAbility(abilityDefinitions.speed, 100, 15_100)).toBe(true);
  });
  it('filters targets by identity, state, and protection', () => {
    expect(isEligibleTarget(player(), 'local', 0, 100)).toBe(true);
    expect(isEligibleTarget(player(), 'ada', 0, 100)).toBe(false);
    expect(isEligibleTarget(player({ state: 'INVULNERABLE' }), 'local', 0, 100)).toBe(false);
    expect(isEligibleTarget(player(), 'local', 200, 100)).toBe(false);
  });
  it('prevents rockets hitting the owner or protected states', () => {
    expect(canRocketHit('local', player())).toBe(true);
    expect(canRocketHit('ada', player())).toBe(false);
    expect(canRocketHit('local', player({ state: 'RESPAWNING' }))).toBe(false);
  });
});

describe('question validation', () => {
  const textQuestion: RetroQuestion = { id: 'x', category: 'Went well', type: 'text', prompt: 'Reflect', required: true };
  it('requires a meaningful required response', () => expect(validateQuestionResponse(textQuestion, '   ')).toMatch(/share/i));
  it('accepts free text', () => expect(validateQuestionResponse(textQuestion, 'Pairing helped.')).toBeNull());
  it('requires an approved choice', () => expect(validateQuestionResponse({ ...textQuestion, type: 'singleChoice', options: ['A', 'B'] }, 'C')).toMatch(/choose/i));
});

describe('map safety rules', () => {
  it('detects players behind the camera boundary', () => { expect(isBehindCamera(175, 100, 84)).toBe(true); expect(isBehindCamera(190, 100, 84)).toBe(false); });
  it('keeps a safe latest checkpoint', () => expect(selectSafeRespawn(sampleMap.checkpoints, 'cp2', 2500).id).toBe('cp2'));
  it('advances past an unsafe checkpoint', () => expect(selectSafeRespawn(sampleMap.checkpoints, 'start', 1000).id).toBe('cp1'));
});
