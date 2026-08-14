import { describe, expect, it, vi } from 'vitest';
import { gameplayConfig } from '../../data/gameplayConfig';
import type { ChunkTemplate } from './ProceduralChunkTemplates';
import { HANDCRAFTED_CHUNK_TEMPLATES, findChunkTemplate } from './ProceduralChunkTemplates';
import type { GeneratedChunk } from './ProceduralMapGenerator';
import {
  MAX_FLAT_STREAK,
  TERRAIN_RHYTHM_TAGS,
  ProceduralMapGenerator,
  RoundSeedSequence,
  lanePlatformY,
  terrainRhythmTags,
  validateChunkTemplates,
} from './ProceduralMapGenerator';
import { horizontalEdgeGap, isPlatformReachable, requiredVerticalRise } from './LevelReachability';

const config = gameplayConfig.proceduralMap;
const movement = gameplayConfig.player;

function generator(seed: number) {
  return new ProceduralMapGenerator(seed, config, movement, gameplayConfig.world.floorY);
}

function generate(seed: number, count = 120) {
  const map = generator(seed);
  map.createInitialChunks();
  for (let index = 0; index < count; index += 1) map.generateNextChunk();
  return map;
}

function serialize(chunks: readonly GeneratedChunk[]) {
  return chunks.map(({ templateId, platforms, pickups, decorations }) => ({ templateId, platforms, pickups, decorations }));
}

function mandatoryRoute(chunks: readonly GeneratedChunk[]) {
  return chunks.flatMap((chunk) => chunk.mandatoryPlatformIds.map((id) => chunk.platforms.find((platform) => platform.id === id)!));
}

describe('handcrafted procedural chunk library', () => {
  it('contains the intended small library and validates every template', () => {
    expect(HANDCRAFTED_CHUNK_TEMPLATES.map((template) => template.id)).toEqual([
      'safe-flat', 'small-gap', 'two-step-up', 'two-step-down', 'medium-gap', 'elevated-optional-route',
      'ability-upper-platform', 'staggered-platforms', 'recovery-flat', 'low-high-low', 'split-route', 'obstacle-flat',
    ]);
    expect(validateChunkTemplates(HANDCRAFTED_CHUNK_TEMPLATES, config, movement, gameplayConfig.world.floorY)).toBe(true);
  });

  it('requires a real main route with matching entry and exit for every template', () => {
    for (const template of HANDCRAFTED_CHUNK_TEMPLATES) {
      expect(template.mainRoute.length).toBeGreaterThan(0);
      expect(template.entry.platformIndex).toBe(template.mainRoute[0]);
      expect(template.exit.platformIndex).toBe(template.mainRoute.at(-1));
      expect(template.platforms[template.entry.platformIndex]?.route).toBe('main');
      expect(template.platforms[template.exit.platformIndex]?.route).toBe('main');
    }
  });

  it('fails fast for decorations without a terrain anchor', () => {
    const source = HANDCRAFTED_CHUNK_TEMPLATES[0]!;
    const invalid: ChunkTemplate = { ...source, id: 'invalid-decoration', decorations: [{ type: 'shrub', platformIndex: 99, horizontalAnchor: 'center' }] };
    expect(() => validateChunkTemplates([invalid], config, movement, gameplayConfig.world.floorY)).toThrow(/missing platform 99/);
  });
});

describe('ProceduralMapGenerator', () => {
  it('produces the same chunk order and safe variations for the same seed', () => {
    expect(serialize(generate(42, 40).activeChunks)).toEqual(serialize(generate(42, 40).activeChunks));
  });

  it('gives two clients the same first 40 template and gameplay pickup IDs for a server seed', () => {
    const firstClient = generate(94815321, 40).activeChunks;
    const secondClient = generate(94815321, 40).activeChunks;
    expect(firstClient.map((chunk) => chunk.templateId)).toEqual(secondClient.map((chunk) => chunk.templateId));
    expect(firstClient.flatMap((chunk) => chunk.pickups.map((pickup) => pickup.id)))
      .toEqual(secondClient.flatMap((chunk) => chunk.pickups.map((pickup) => pickup.id)));
  });

  it('never consults uncontrolled Math.random for gameplay-critical generation', () => {
    const uncontrolled = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('unseeded random used'); });
    try {
      expect(() => generate(94815321, 60)).not.toThrow();
    } finally {
      uncontrolled.mockRestore();
    }
  });

  it('usually produces a different chunk order for different seeds', () => {
    const first = generate(41, 30).activeChunks.map((chunk) => chunk.templateId);
    const second = generate(42, 30).activeChunks.map((chunk) => chunk.templateId);
    expect(first).not.toEqual(second);
  });

  it('always begins StartChunk -> safe-flat before procedural selection', () => {
    expect(generator(99).createInitialChunks().slice(0, 2).map((chunk) => chunk.templateId)).toEqual(['start', 'safe-flat']);
  });

  it('does not repeat a selected template within the recent-history window', () => {
    const ids = generate(20260810, 500).activeChunks.map((chunk) => chunk.templateId);
    for (let index = 2; index < ids.length; index += 1) {
      expect(ids.slice(Math.max(1, index - config.recentChunkHistory), index)).not.toContain(ids[index]);
    }
  });

  it('uses distance difficulty to admit authored chunks without distorting their geometry', () => {
    for (const chunk of generate(4455, 500).activeChunks) {
      const template = findChunkTemplate(chunk.templateId);
      if (!template) continue;
      const maximumDifficulty = chunk.difficulty < 0.3 ? 0.3 : chunk.difficulty < 0.6 ? 0.65 : 1;
      expect(template.difficulty).toBeLessThanOrEqual(maximumDifficulty);
    }
  });

  it('keeps safe terrain-shape variation available in the early pool', () => {
    const earlyIds = HANDCRAFTED_CHUNK_TEMPLATES.filter((template) => template.difficulty <= 0.3).map((template) => template.id);
    expect(earlyIds).toEqual(expect.arrayContaining([
      'safe-flat', 'small-gap', 'two-step-up', 'two-step-down', 'recovery-flat', 'low-high-low', 'staggered-platforms',
    ]));
  });

  it('guarantees elevation and non-flat terrain within the first five generated chunks', () => {
    for (const seed of [1, 7, 42, 99, 20260810, 0xffffffff]) {
      const firstFive = generator(seed).createInitialChunks().filter((chunk) => chunk.templateId !== 'start').slice(0, 5);
      expect(firstFive).toHaveLength(5);
      expect(firstFive.some((chunk) => chunk.tags.includes('ascending') || chunk.tags.includes('descending'))).toBe(true);
      expect(firstFive.some((chunk) => chunk.tags.some((tag) => ['gap', 'vertical', 'ascending', 'descending'].includes(tag)))).toBe(true);
    }
  });

  it('enforces terrain rhythm limits over at least 1,000 generated chunks', () => {
    const chunks = generate(8822, 1_000).activeChunks.filter((chunk) => chunk.templateId !== 'start');
    let flatStreak = 0;
    let laneStreak = 0;
    let previousLane: number | undefined;
    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index]!;
      flatStreak = chunk.tags.includes('flat') ? flatStreak + 1 : 0;
      expect(flatStreak).toBeLessThanOrEqual(MAX_FLAT_STREAK);
      if (index > 0) expect(!(chunk.tags.includes('recovery') && chunks[index - 1]!.tags.includes('recovery'))).toBe(true);

      const exitLane = chunk.platforms.find((platform) => platform.id === chunk.exitPlatformId)!.lane;
      laneStreak = exitLane === previousLane ? laneStreak + 1 : 1;
      previousLane = exitLane;
      expect(laneStreak).toBeLessThanOrEqual(3);

      if (index >= 2) {
        const previousTwo = chunks.slice(index - 2, index);
        for (const terrainTag of TERRAIN_RHYTHM_TAGS) {
          expect(!(chunk.tags.includes(terrainTag) && previousTwo.every((candidate) => candidate.tags.includes(terrainTag)))).toBe(true);
        }
      }
    }
  });

  it('uses recovery primarily after demanding terrain and varies immediately afterward', () => {
    const chunks = generate(445566, 1_000).activeChunks.filter((chunk) => chunk.templateId !== 'start');
    const recoveries = chunks.flatMap((chunk, index) => chunk.tags.includes('recovery') ? [{ chunk, index }] : []);
    const demandingPredecessors = recoveries.filter(({ index }) => index > 0 && terrainRhythmTags(chunks[index - 1]!.tags)
      .some((tag) => ['technical', 'gap', 'vertical', 'ascending', 'descending'].includes(tag)));
    expect(recoveries.length).toBeGreaterThan(20);
    expect(demandingPredecessors.length / recoveries.length).toBeGreaterThan(0.75);
    for (const { index } of recoveries) {
      if (index + 1 >= chunks.length) continue;
      expect(chunks[index + 1]!.tags.includes('recovery')).toBe(false);
    }
  });

  it('keeps deterministic three-chunk terrain and exit-lane memory', () => {
    const map = generate(13579, 40);
    const recentChunks = map.activeChunks.filter((chunk) => chunk.templateId !== 'start').slice(-3);
    expect(map.state.lastTerrainTags).toEqual(recentChunks.map((chunk) => terrainRhythmTags(chunk.tags)));
    expect(map.state.recentExitLanes).toEqual(recentChunks.map((chunk) => chunk.platforms.find((platform) => platform.id === chunk.exitPlatformId)!.lane));
  });

  it('keeps rhythm constraints selectable across many long seeded sequences', () => {
    for (let seed = 0; seed < 20; seed += 1) {
      expect(() => generate(seed * 104_729 + 17, 1_000)).not.toThrow();
    }
  });

  it.each([1, 7, 42, 20260810, 0xffffffff])('keeps every main route and chunk boundary reachable for seed %s', (seed) => {
    const map = generate(seed, 180);
    const route = mandatoryRoute(map.activeChunks);
    expect(map.validateMandatoryRoute()).toBe(true);
    for (let index = 1; index < route.length; index += 1) {
      const from = route[index - 1]!;
      const to = route[index]!;
      expect(isPlatformReachable(from, to, movement, config.reachabilitySafetyFactor), `${from.id} -> ${to.id}`).toBe(true);
      expect(requiredVerticalRise(from, to)).toBeLessThanOrEqual(config.maximumSafeVerticalRise);
      expect(horizontalEdgeGap(from, to)).toBeLessThanOrEqual(config.maximumSafeGap);
    }
  });

  it('instantiates only authored topology on discrete vertical lanes', () => {
    const map = generate(77, 240);
    for (const chunk of map.activeChunks.filter((candidate) => candidate.templateId !== 'start')) {
      const template = findChunkTemplate(chunk.templateId)!;
      const entryLane = chunk.platforms[template.entry.platformIndex]!.lane;
      for (const platform of chunk.platforms) {
        const authored = template.platforms[platform.templateIndex]!;
        expect(platform.x - chunk.startX).toBe(authored.x);
        expect(Math.abs(platform.width - authored.width)).toBeLessThanOrEqual(authored.varyWidth ? config.platformWidthVariation : 0);
        expect(platform.lane).toBe(entryLane + authored.laneOffset);
        expect(platform.y).toBe(lanePlatformY(gameplayConfig.world.floorY, config.platformHeight, config.verticalLaneSpacing, platform.lane));
        expect(platform.route).toBe(authored.route);
      }
    }
  });

  it('creates optional upper platforms only when the selected template authored them', () => {
    const map = generate(8675309, 260);
    for (const chunk of map.activeChunks) {
      const template = findChunkTemplate(chunk.templateId);
      for (const platform of chunk.platforms.filter((candidate) => !candidate.mandatory)) {
        expect(template).toBeDefined();
        expect(template!.platforms[platform.templateIndex]?.route).toBe('optional');
        expect(template!.optionalRoute).toContain(platform.templateIndex);
      }
    }
  });

  it('anchors every pickup to an authored reachable platform slot', () => {
    const map = generate(8675309, 320);
    const pickups = map.activeChunks.flatMap((chunk) => chunk.pickups);
    expect(pickups.length).toBeGreaterThan(20);
    for (const chunk of map.activeChunks) {
      const template = findChunkTemplate(chunk.templateId);
      for (const pickup of chunk.pickups) {
        const platform = chunk.platforms.find((candidate) => candidate.id === pickup.platformId)!;
        const slot = template!.pickups.find((candidate) => candidate.platformIndex === platform.templateIndex)!;
        expect(platform).toBeDefined();
        expect(pickup.x).toBe(platform.x + slot.localOffsetX);
        expect(pickup.y).toBe(platform.y - platform.height / 2 - 32);
        expect(platform.mandatory || chunk.optionalPlatformIds.includes(platform.id)).toBe(true);
      }
      if (template?.optionalRoute) {
        const route = template.optionalRoute.map((platformIndex) => chunk.platforms[platformIndex]!);
        for (let index = 1; index < route.length; index += 1) {
          expect(isPlatformReachable(route[index - 1]!, route[index]!, movement, config.reachabilitySafetyFactor)).toBe(true);
        }
      }
    }
  });

  it('uses the tuned authored pickup chances without sacrificing seeded determinism', () => {
    expect(findChunkTemplate('elevated-optional-route')?.pickups[0]?.chance).toBe(0.8);
    expect(findChunkTemplate('ability-upper-platform')?.pickups[0]?.chance).toBeUndefined();
    expect(findChunkTemplate('split-route')?.pickups[0]?.chance).toBe(0.9);

    const first = generate(20260814, 240).activeChunks.flatMap((chunk) => chunk.pickups);
    const replay = generate(20260814, 240).activeChunks.flatMap((chunk) => chunk.pickups);
    expect(first.length).toBeGreaterThan(20);
    expect(first).toEqual(replay);
  });

  it.each(['shrub', 'sign', 'lantern'] as const)('keeps every %s terrain-anchored', (decorationType) => {
    const chunks = generate(125, 500).activeChunks;
    const decorations = chunks.flatMap((chunk) => chunk.decorations.filter((decoration) => decoration.type === decorationType));
    expect(decorations.length).toBeGreaterThan(0);
    for (const decoration of decorations) {
      const chunk = chunks.find((candidate) => candidate.decorations.includes(decoration))!;
      const platform = chunk.platforms.find((candidate) => candidate.id === decoration.platformId)!;
      const template = findChunkTemplate(chunk.templateId)!;
      const slot = template.decorations.find((candidate) => candidate.platformIndex === platform.templateIndex && candidate.type === decoration.type)!;
      expect(platform).toBeDefined();
      expect(decoration.y).toBe(platform.y - platform.height / 2 + (slot.verticalOffset ?? 0));
      expect(decoration.x).toBeGreaterThanOrEqual(platform.x + 56);
      expect(decoration.x).toBeLessThanOrEqual(platform.x + platform.width - 56);
    }
  });

  it('derives every decoration position from its referenced platform surface', () => {
    const chunks = generate(9125, 400).activeChunks;
    for (const chunk of chunks) {
      const template = findChunkTemplate(chunk.templateId);
      for (const decoration of chunk.decorations) {
        const platform = chunk.platforms.find((candidate) => candidate.id === decoration.platformId)!;
        const slot = template!.decorations.find((candidate) => candidate.platformIndex === platform.templateIndex && candidate.type === decoration.type)!;
        expect(platform).toBeDefined();
        expect(decoration.y).toBe(platform.y - platform.height / 2 + (slot.verticalOffset ?? 0));
        expect(decoration.x).toBeGreaterThanOrEqual(platform.x + 56);
        expect(decoration.x).toBeLessThanOrEqual(platform.x + platform.width - 56);
      }
    }
  });

  it('continues indefinitely with unique IDs and capped difficulty', () => {
    const map = generate(1234, 1_000);
    const chunkIds = map.activeChunks.map((chunk) => chunk.id);
    const objectIds = map.activeChunks.flatMap((chunk) => [...chunk.platforms, ...chunk.pickups, ...chunk.decorations].map((object) => object.id));
    expect(map.activeChunks.every((chunk) => chunk.mandatoryPlatformIds.length > 0 && chunk.exitPlatformId)).toBe(true);
    expect(map.activeChunks.every((chunk) => chunk.difficulty >= 0 && chunk.difficulty <= 1)).toBe(true);
    expect(new Set(chunkIds).size).toBe(chunkIds.length);
    expect(new Set(objectIds).size).toBe(objectIds.length);
    expect(map.generatedEndX).toBeGreaterThan(700_000);
  });

  it('generates ahead and safely removes only old chunks', () => {
    const map = generator(71);
    map.createInitialChunks();
    const target = 25_000 + config.chunksAhead * config.targetChunkLength;
    map.generateThrough(target);
    expect(map.generatedEndX).toBeGreaterThanOrEqual(target);
    const threshold = 8_000;
    const forwardBefore = map.activeChunks.filter((chunk) => chunk.endX >= threshold).map((chunk) => chunk.id);
    const removed = map.removeChunksBefore(threshold);
    expect(removed.length).toBeGreaterThan(0);
    expect(removed.every((chunk) => chunk.endX < threshold)).toBe(true);
    expect(map.activeChunks.map((chunk) => chunk.id)).toEqual(forwardBefore);
  });

  it('produces a new replayable deterministic sequence for each round seed', () => {
    const seeds = new RoundSeedSequence(20260810);
    const first = seeds.nextSeed();
    const second = seeds.nextSeed();
    const replay = new RoundSeedSequence(20260810);
    expect([first, second]).toEqual([replay.nextSeed(), replay.nextSeed()]);
    expect(serialize(generator(first).createInitialChunks())).not.toEqual(serialize(generator(second).createInitialChunks()));
  });

  it('leaves the current movement configuration and debug mode unchanged by default', () => {
    expect(gameplayConfig.player).toMatchObject({
      gravity: 1_400, acceleration: 1_450, maxRunSpeed: 330, jumpVelocity: 650,
      coyoteTimeMs: 120, jumpBufferMs: 140, airborneControlMultiplier: 0.82,
    });
    expect(config.debugChunks).toBe(false);
  });
});
