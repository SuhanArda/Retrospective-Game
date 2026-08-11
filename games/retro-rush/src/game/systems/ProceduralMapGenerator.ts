import type { ProceduralMapConfig } from '../../data/gameplayConfig';
import type { AbilityId } from '../../domain/types';
import { SeededRandom } from '../../testing/bot/SeededRandom';
import type { Platform } from '../map/mapTypes';
import {
  HANDCRAFTED_CHUNK_TEMPLATES,
  type ChunkTag,
  type ChunkTemplate,
  type DecorationType,
  type HorizontalAnchor,
} from './ProceduralChunkTemplates';
import {
  calculateReachabilityLimits,
  horizontalEdgeGap,
  isPlatformReachable,
  requiredVerticalRise,
  type ReachabilityMovementConfig,
} from './LevelReachability';

export interface GeneratedPlatform extends Platform {
  mandatory: boolean;
  route: 'main' | 'optional';
  templateIndex: number;
  lane: number;
}

export interface GeneratedPickup {
  id: string;
  ability: AbilityId;
  x: number;
  y: number;
  platformId: string;
}

export interface GeneratedDecoration {
  id: string;
  type: DecorationType;
  x: number;
  y: number;
  platformId: string;
  variant: number;
}

export interface GeneratedChunkAnchor {
  x: number;
  y: number;
  platformId: string;
}

export interface GeneratedChunk {
  id: string;
  index: number;
  type: string;
  templateId: string;
  tags: readonly ChunkTag[];
  startX: number;
  endX: number;
  difficulty: number;
  platforms: GeneratedPlatform[];
  pickups: GeneratedPickup[];
  decorations: GeneratedDecoration[];
  mandatoryPlatformIds: string[];
  optionalPlatformIds: string[];
  entryPlatformId?: string;
  exitPlatformId: string;
  entryAnchor: GeneratedChunkAnchor;
  exitAnchor: GeneratedChunkAnchor;
}

export interface ProceduralMapState {
  seed: number;
  nextChunkIndex: number;
  recentTemplateIds: readonly string[];
  lastTerrainTags: ReadonlyArray<readonly TerrainRhythmTag[]>;
  recentExitLanes: readonly number[];
}

const ABILITIES: readonly AbilityId[] = ['speed', 'rocket', 'ask'];
const DECORATION_PADDING = 56;
export const MAX_FLAT_STREAK = 2;
export const TERRAIN_RHYTHM_TAGS = ['flat', 'ascending', 'descending', 'gap', 'vertical', 'split', 'technical', 'recovery'] as const;
export type TerrainRhythmTag = (typeof TERRAIN_RHYTHM_TAGS)[number];

interface TerrainHistoryEntry {
  tags: readonly TerrainRhythmTag[];
  exitLane: number;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function lanePlatformY(floorY: number, platformHeight: number, laneSpacing: number, lane: number) {
  return floorY + platformHeight / 2 - lane * laneSpacing;
}

function platformTop(platform: Platform) {
  return platform.y - platform.height / 2;
}

export function terrainRhythmTags(tags: readonly ChunkTag[]): readonly TerrainRhythmTag[] {
  return TERRAIN_RHYTHM_TAGS.filter((tag) => tags.includes(tag));
}

function anchorX(anchor: HorizontalAnchor, platform: Platform) {
  if (typeof anchor === 'number') return platform.x + anchor;
  if (anchor === 'left') return platform.x + DECORATION_PADDING;
  if (anchor === 'right') return platform.x + platform.width - DECORATION_PADDING;
  return platform.x + platform.width / 2;
}

export class RoundSeedSequence {
  private readonly random: SeededRandom;

  constructor(seedSource: number) {
    this.random = new SeededRandom(seedSource >>> 0);
  }

  nextSeed() {
    return Math.floor(this.random.next() * 4_294_967_296) >>> 0;
  }
}

export function validateChunkTemplates(
  templates: readonly ChunkTemplate[],
  config: ProceduralMapConfig,
  movement: ReachabilityMovementConfig,
  floorY: number,
) {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const template of templates) {
    const fail = (message: string) => errors.push(`${template.id}: ${message}`);
    if (ids.has(template.id)) fail('duplicate template ID');
    ids.add(template.id);
    if (template.difficulty < 0 || template.difficulty > 1) fail('difficulty must be between 0 and 1');
    if (template.width <= 0) fail('width must be positive');
    if (template.platforms.length === 0) fail('must contain platforms');
    if (template.mainRoute.length === 0) fail('must define a main route');
    if (template.entry.platformIndex !== template.mainRoute[0]) fail('entry must be the first main-route platform');
    if (template.exit.platformIndex !== template.mainRoute[template.mainRoute.length - 1]) fail('exit must be the final main-route platform');
    if (template.optionalRoute && template.optionalRoute[0] !== template.entry.platformIndex) fail('optional route must begin at the chunk entry');
    if (template.optionalRoute && template.optionalRoute.at(-1) !== template.exit.platformIndex) fail('optional route must rejoin at the chunk exit');
    if (template.entry.laneOffset !== 0) fail('entry lane offset must be zero for chunk composition');
    for (const platformIndex of template.mainRoute) {
      if (template.platforms[platformIndex]?.route !== 'main') fail(`main route references non-main platform ${platformIndex}`);
    }
    template.platforms.forEach((platform, platformIndex) => {
      if (platform.route === 'main' && !template.mainRoute.includes(platformIndex)) fail(`main platform ${platformIndex} is missing from main route`);
      if (platform.route === 'optional' && !template.optionalRoute?.includes(platformIndex)) fail(`optional platform ${platformIndex} is missing from optional route`);
    });

    template.platforms.forEach((platform, platformIndex) => {
      if (platform.x < 0 || platform.width <= 0) fail(`platform ${platformIndex} has invalid dimensions`);
      if (platform.x + platform.width > template.width) fail(`platform ${platformIndex} exceeds chunk width`);
    });

    const entry = template.platforms[template.entry.platformIndex];
    const exit = template.platforms[template.exit.platformIndex];
    if (!entry) fail('entry platform does not exist');
    if (!exit) fail('exit platform does not exist');
    if (entry && entry.laneOffset !== template.entry.laneOffset) fail('entry lane does not match its platform');
    if (exit && exit.laneOffset !== template.exit.laneOffset) fail('exit lane does not match its platform');
    if (exit && exit.x + exit.width !== template.width) fail('exit platform must end at the authored chunk boundary');

    const laneOffsets = template.platforms.map((platform) => platform.laneOffset);
    const minimumLaneOffset = Math.min(...laneOffsets);
    const maximumLaneOffset = Math.max(...laneOffsets);
    if (maximumLaneOffset - minimumLaneOffset >= config.verticalLaneCount) fail('platform lanes cannot fit the configured lane set');
    const validationBaseLane = Math.max(0, -minimumLaneOffset);
    const validationPlatforms = template.platforms.map((platform, platformIndex): GeneratedPlatform => ({
      id: `${template.id}-validation-${platformIndex}`,
      x: platform.x,
      y: lanePlatformY(floorY, config.platformHeight, config.verticalLaneSpacing, validationBaseLane + platform.laneOffset),
      width: platform.width - (platform.varyWidth ? config.platformWidthVariation : 0),
      height: config.platformHeight,
      mandatory: platform.route === 'main',
      route: platform.route,
      templateIndex: platformIndex,
      lane: validationBaseLane + platform.laneOffset,
    }));

    const validateRoute = (route: readonly number[] | undefined, label: string) => {
      if (!route) return;
      for (const platformIndex of route) if (!validationPlatforms[platformIndex]) fail(`${label} references missing platform ${platformIndex}`);
      for (let index = 1; index < route.length; index += 1) {
        const from = validationPlatforms[route[index - 1]!];
        const to = validationPlatforms[route[index]!];
        if (from && to && !isPlatformReachable(from, to, movement, config.reachabilitySafetyFactor)) {
          fail(`${label} transition ${route[index - 1]} -> ${route[index]} is unreachable`);
        }
      }
    };
    validateRoute(template.mainRoute, 'main route');
    validateRoute(template.optionalRoute, 'optional route');

    for (const pickup of template.pickups) {
      const platform = template.platforms[pickup.platformIndex];
      if (!platform) fail(`pickup references missing platform ${pickup.platformIndex}`);
      else if (pickup.localOffsetX < 32 || pickup.localOffsetX > platform.width - 32) fail(`pickup is outside safe platform ${pickup.platformIndex} bounds`);
      else if (platform.route === 'optional' && !template.optionalRoute?.includes(pickup.platformIndex)) fail(`pickup platform ${pickup.platformIndex} is not on a reachable route`);
      if (pickup.chance !== undefined && (pickup.chance < 0 || pickup.chance > 1)) fail('pickup chance must be between 0 and 1');
    }

    for (const decoration of template.decorations) {
      const platform = template.platforms[decoration.platformIndex];
      if (!platform) fail(`${decoration.type} decoration references missing platform ${decoration.platformIndex}`);
      if (typeof decoration.horizontalAnchor === 'number' && platform
        && (decoration.horizontalAnchor < DECORATION_PADDING || decoration.horizontalAnchor > platform.width - DECORATION_PADDING)) {
        fail(`${decoration.type} decoration is outside safe platform bounds`);
      }
      if (decoration.type === 'sign' && !template.tags.some((tag) => ['gap', 'upper-route', 'recovery'].includes(tag))) {
        fail('sign must mark a gap, upper route, or recovery section');
      }
    }
  }
  if (errors.length > 0) throw new Error(`Invalid procedural chunk templates:\n${errors.join('\n')}`);
  return true;
}

export class ProceduralMapGenerator {
  private readonly random: SeededRandom;
  private readonly chunks: GeneratedChunk[] = [];
  private readonly recentTemplateIds: string[] = [];
  private readonly terrainHistory: TerrainHistoryEntry[] = [];
  private nextChunkIndex = 0;
  private exitPlatform?: GeneratedPlatform;
  private exitLane = 0;

  constructor(
    readonly seed: number,
    private readonly config: ProceduralMapConfig,
    private readonly movement: ReachabilityMovementConfig,
    private readonly floorY: number,
    private readonly templates: readonly ChunkTemplate[] = HANDCRAFTED_CHUNK_TEMPLATES,
  ) {
    this.random = new SeededRandom(seed >>> 0);
    validateChunkTemplates(templates, config, movement, floorY);
  }

  get state(): ProceduralMapState {
    return {
      seed: this.seed,
      nextChunkIndex: this.nextChunkIndex,
      recentTemplateIds: [...this.recentTemplateIds],
      lastTerrainTags: this.terrainHistory.map((entry) => [...entry.tags]),
      recentExitLanes: this.terrainHistory.map((entry) => entry.exitLane),
    };
  }

  get activeChunks(): readonly GeneratedChunk[] {
    return this.chunks;
  }

  get generatedEndX() {
    return this.chunks.at(-1)?.endX ?? 0;
  }

  createInitialChunks() {
    if (this.chunks.length > 0) return [...this.chunks];
    const generated = [this.createStartChunk()];
    const safeTemplate = this.templates.find((template) => template.id === 'safe-flat');
    if (!safeTemplate) throw new Error('Missing required safe-flat chunk template');
    generated.push(this.instantiateTemplate(safeTemplate));
    for (let index = 1; index < this.config.initialRandomChunks; index += 1) generated.push(this.generateNextChunk());
    return generated;
  }

  generateThrough(targetX: number) {
    const generated: GeneratedChunk[] = [];
    while (this.generatedEndX < targetX) generated.push(this.generateNextChunk());
    return generated;
  }

  generateNextChunk(): GeneratedChunk {
    if (!this.exitPlatform) return this.createStartChunk();
    const difficulty = clamp(this.generatedEndX / this.config.difficultyDistanceScale, 0, 1);
    return this.instantiateTemplate(this.chooseTemplate(difficulty));
  }

  removeChunksBefore(thresholdX: number) {
    const removed: GeneratedChunk[] = [];
    while (this.chunks.length > 1 && this.chunks[0]!.endX < thresholdX) removed.push(this.chunks.shift()!);
    return removed;
  }

  validateMandatoryRoute() {
    let previous: GeneratedPlatform | undefined;
    for (const chunk of this.chunks) {
      for (const id of chunk.mandatoryPlatformIds) {
        const platform = chunk.platforms.find((candidate) => candidate.id === id)!;
        if (previous && !isPlatformReachable(previous, platform, this.movement, this.config.reachabilitySafetyFactor)) return false;
        previous = platform;
      }
    }
    return true;
  }

  private instantiateTemplate(template: ChunkTemplate) {
    if (!this.exitPlatform) throw new Error('Cannot instantiate a chunk before the start chunk');
    if (!this.isCompatible(template)) throw new Error(`Chunk ${template.id} is incompatible with lane ${this.exitLane}`);
    const index = this.nextChunkIndex++;
    const id = `chunk-${index}-${template.id}`;
    const originX = this.generatedEndX;
    const baseLane = this.exitLane;
    const platforms = template.platforms.map((platform, templateIndex): GeneratedPlatform => {
      const widthVariation = platform.varyWidth ? Math.round(this.signedVariation(this.config.platformWidthVariation)) : 0;
      return {
        id: `${id}-platform-${templateIndex}`,
        x: originX + platform.x,
        y: lanePlatformY(this.floorY, this.config.platformHeight, this.config.verticalLaneSpacing, baseLane + platform.laneOffset),
        width: platform.width + widthVariation,
        height: this.config.platformHeight,
        mandatory: platform.route === 'main',
        route: platform.route,
        templateIndex,
        lane: baseLane + platform.laneOffset,
      };
    });
    const mandatoryPlatformIds = template.mainRoute.map((platformIndex) => platforms[platformIndex]!.id);
    const optionalPlatformIds = (template.optionalRoute ?? [])
      .filter((platformIndex) => !template.mainRoute.includes(platformIndex))
      .map((platformIndex) => platforms[platformIndex]!.id);
    const entry = platforms[template.entry.platformIndex]!;
    const exit = platforms[template.exit.platformIndex]!;
    if (!isPlatformReachable(this.exitPlatform, entry, this.movement, this.config.reachabilitySafetyFactor)) {
      throw new Error(`Unreachable chunk boundary ${this.exitPlatform.id} -> ${entry.id}`);
    }
    this.assertRouteReachable(template.mainRoute, platforms, `${template.id} main route`);
    if (template.optionalRoute) this.assertRouteReachable(template.optionalRoute, platforms, `${template.id} optional route`);

    const pickups = template.pickups.flatMap((slot, pickupIndex): GeneratedPickup[] => {
      if (slot.chance !== undefined && this.random.next() > slot.chance) return [];
      const platform = platforms[slot.platformIndex]!;
      return [{
        id: `${id}-pickup-${pickupIndex}`,
        ability: slot.type === 'random' ? ABILITIES[Math.floor(this.random.next() * ABILITIES.length)]! : slot.type,
        x: platform.x + slot.localOffsetX,
        y: platformTop(platform) - 32,
        platformId: platform.id,
      }];
    });

    const decorations = template.decorations.map((slot, decorationIndex): GeneratedDecoration => {
      const platform = platforms[slot.platformIndex]!;
      const variation = slot.varyHorizontal ? this.signedVariation(this.config.decorationHorizontalVariation) : 0;
      const x = clamp(anchorX(slot.horizontalAnchor, platform) + variation, platform.x + DECORATION_PADDING, platform.x + platform.width - DECORATION_PADDING);
      const variants = slot.variants ?? [1];
      return {
        id: `${id}-decoration-${decorationIndex}`,
        type: slot.type,
        x,
        y: platformTop(platform) + (slot.verticalOffset ?? 0),
        platformId: platform.id,
        variant: variants[Math.floor(this.random.next() * variants.length)]!,
      };
    });

    const chunk: GeneratedChunk = {
      id,
      index,
      type: template.id,
      templateId: template.id,
      tags: template.tags,
      startX: originX,
      endX: originX + template.width,
      difficulty: clamp(originX / this.config.difficultyDistanceScale, 0, 1),
      platforms,
      pickups,
      decorations,
      mandatoryPlatformIds,
      optionalPlatformIds,
      entryPlatformId: entry.id,
      exitPlatformId: exit.id,
      entryAnchor: { x: entry.x, y: platformTop(entry), platformId: entry.id },
      exitAnchor: { x: exit.x + exit.width, y: platformTop(exit), platformId: exit.id },
    };
    this.exitPlatform = exit;
    this.exitLane = exit.lane;
    this.chunks.push(chunk);
    this.rememberTemplate(template);
    return chunk;
  }

  private createStartChunk() {
    const index = this.nextChunkIndex++;
    const id = `chunk-${index}-start`;
    const platform: GeneratedPlatform = {
      id: `${id}-platform-0`,
      x: 0,
      y: lanePlatformY(this.floorY, this.config.platformHeight, this.config.verticalLaneSpacing, 0),
      width: this.config.startPlatformWidth,
      height: this.config.platformHeight,
      mandatory: true,
      route: 'main',
      templateIndex: 0,
      lane: 0,
    };
    const top = platformTop(platform);
    const chunk: GeneratedChunk = {
      id,
      index,
      type: 'start',
      templateId: 'start',
      tags: ['easy', 'flat'],
      startX: 0,
      endX: platform.width,
      difficulty: 0,
      platforms: [platform],
      pickups: [],
      decorations: [],
      mandatoryPlatformIds: [platform.id],
      optionalPlatformIds: [],
      exitPlatformId: platform.id,
      entryAnchor: { x: platform.x, y: top, platformId: platform.id },
      exitAnchor: { x: platform.x + platform.width, y: top, platformId: platform.id },
    };
    this.exitPlatform = platform;
    this.exitLane = 0;
    this.chunks.push(chunk);
    return chunk;
  }

  private chooseTemplate(difficulty: number) {
    const maximumDifficulty = difficulty < 0.3 ? 0.3 : difficulty < 0.6 ? 0.65 : 1;
    let candidates = this.templates.filter((template) => template.difficulty <= maximumDifficulty && this.isCompatible(template));
    if (candidates.length === 0) throw new Error(`No compatible handcrafted chunks for lane ${this.exitLane}`);

    const generatedChunkCount = this.chunks.length - 1;
    if (generatedChunkCount === 1) {
      const elevationChange = candidates.filter((template) => template.exit.laneOffset !== 0 && template.tags.some((tag) => tag === 'ascending' || tag === 'descending'));
      if (elevationChange.length > 0) candidates = elevationChange;
    } else if (generatedChunkCount === 2) {
      const earlyVariation = candidates.filter((template) => template.tags.some((tag) => tag === 'gap' || tag === 'vertical' || tag === 'split'));
      if (earlyVariation.length > 0) candidates = earlyVariation;
    }
    const withoutRecent = candidates.filter((template) => !this.recentTemplateIds.includes(template.id));
    if (withoutRecent.length > 0) candidates = withoutRecent;

    const weighted = candidates
      .map((template) => ({ template, weight: this.templateWeight(template, difficulty) }))
      .filter((candidate) => candidate.weight > 0);
    if (weighted.length === 0) throw new Error(`Terrain rhythm rules left no valid chunks for lane ${this.exitLane}`);
    const totalWeight = weighted.reduce((total, candidate) => total + candidate.weight, 0);
    let roll = this.random.next() * totalWeight;
    for (const candidate of weighted) {
      roll -= candidate.weight;
      if (roll <= 0) return candidate.template;
    }
    return weighted.at(-1)!.template;
  }

  private templateWeight(template: ChunkTemplate, difficulty: number) {
    const tags = terrainRhythmTags(template.tags);
    const last = this.terrainHistory.at(-1);
    const previousTwo = this.terrainHistory.slice(-2);
    const flatStreak = this.trailingTerrainCount('flat');
    const recoveryStreak = this.trailingTerrainCount('recovery');
    const resultingExitLane = this.exitLane + template.exit.laneOffset;
    const sameLaneStreak = this.trailingExitLaneCount(this.exitLane);

    if (template.id === this.recentTemplateIds.at(-1)) return 0;
    if (tags.includes('flat') && flatStreak >= MAX_FLAT_STREAK) return 0;
    if (tags.includes('recovery') && recoveryStreak > 0) return 0;
    if (sameLaneStreak >= 3 && resultingExitLane === this.exitLane) return 0;
    if (previousTwo.length === 2 && TERRAIN_RHYTHM_TAGS.some((tag) => tags.includes(tag) && previousTwo.every((entry) => entry.tags.includes(tag)))) return 0;

    let weight = Math.max(0.15, 1.15 - Math.abs(template.difficulty - difficulty));
    if (this.recentTemplateIds.includes(template.id)) weight *= 0.12;
    if (last && tags.some((tag) => last.tags.includes(tag))) weight *= 0.45;
    if (flatStreak === 1 && tags.includes('flat')) weight *= 0.35;

    const previousNeedsRecovery = last?.tags.some((tag) => ['technical', 'gap', 'vertical', 'ascending', 'descending'].includes(tag)) ?? false;
    if (tags.includes('recovery')) weight *= previousNeedsRecovery ? 2.4 : 0.16;
    if (last?.tags.includes('recovery')) {
      if (tags.includes('flat')) weight *= 0.25;
      if (tags.some((tag) => ['ascending', 'descending', 'gap', 'vertical', 'split'].includes(tag))) weight *= 1.65;
    }

    if (sameLaneStreak >= 2) weight *= resultingExitLane === this.exitLane ? 0.2 : 2.2;
    else if (resultingExitLane !== this.exitLane) weight *= 1.15;
    return weight;
  }

  private isCompatible(template: ChunkTemplate) {
    return template.platforms.every((platform) => {
      const lane = this.exitLane + platform.laneOffset;
      return lane >= 0 && lane < this.config.verticalLaneCount;
    });
  }

  private assertRouteReachable(route: readonly number[], platforms: readonly GeneratedPlatform[], label: string) {
    for (let index = 1; index < route.length; index += 1) {
      const from = platforms[route[index - 1]!]!;
      const to = platforms[route[index]!]!;
      if (!isPlatformReachable(from, to, this.movement, this.config.reachabilitySafetyFactor)) {
        throw new Error(`Unreachable ${label}: ${from.id} -> ${to.id}`);
      }
    }
  }

  private rememberTemplate(template: ChunkTemplate) {
    this.recentTemplateIds.push(template.id);
    while (this.recentTemplateIds.length > this.config.recentChunkHistory) this.recentTemplateIds.shift();
    this.terrainHistory.push({ tags: terrainRhythmTags(template.tags), exitLane: this.exitLane });
    while (this.terrainHistory.length > 3) this.terrainHistory.shift();
  }

  private trailingTerrainCount(tag: TerrainRhythmTag) {
    let count = 0;
    for (let index = this.terrainHistory.length - 1; index >= 0 && this.terrainHistory[index]!.tags.includes(tag); index -= 1) count += 1;
    return count;
  }

  private trailingExitLaneCount(lane: number) {
    let count = 0;
    for (let index = this.terrainHistory.length - 1; index >= 0 && this.terrainHistory[index]!.exitLane === lane; index -= 1) count += 1;
    return count;
  }

  private signedVariation(maximumMagnitude: number) {
    return (this.random.next() * 2 - 1) * maximumMagnitude;
  }
}

export function inspectMandatoryTransition(
  from: Platform,
  to: Platform,
  movement: ReachabilityMovementConfig,
  safetyFactor: number,
) {
  return {
    verticalRise: requiredVerticalRise(from, to),
    horizontalGap: horizontalEdgeGap(from, to),
    reachable: isPlatformReachable(from, to, movement, safetyFactor),
    limits: calculateReachabilityLimits(movement, safetyFactor),
  };
}
