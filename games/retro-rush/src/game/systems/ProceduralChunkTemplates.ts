import type { AbilityId } from '../../domain/types';

export type ChunkTag = 'easy' | 'flat' | 'gap' | 'large-gap' | 'ascending' | 'descending' | 'vertical' | 'split' | 'upper-route' | 'ability' | 'recovery' | 'technical' | 'obstacle';
export type PlatformRoute = 'main' | 'optional';
export type DecorationType = 'lantern' | 'sign' | 'rocks' | 'shrub' | 'bench';
export type HorizontalAnchor = 'left' | 'center' | 'right' | number;

export interface ChunkConnection {
  platformIndex: number;
  laneOffset: number;
}

export interface PlatformTemplate {
  x: number;
  laneOffset: number;
  width: number;
  route: PlatformRoute;
  varyWidth?: boolean;
}

export interface PickupTemplate {
  platformIndex: number;
  localOffsetX: number;
  type: AbilityId | 'random';
  chance?: number;
}

export interface DecorationTemplate {
  type: DecorationType;
  platformIndex: number;
  horizontalAnchor: HorizontalAnchor;
  verticalOffset?: number;
  varyHorizontal?: boolean;
  variants?: readonly number[];
}

export interface ChunkTemplate {
  id: string;
  difficulty: number;
  width: number;
  entry: ChunkConnection;
  exit: ChunkConnection;
  platforms: readonly PlatformTemplate[];
  mainRoute: readonly number[];
  optionalRoute?: readonly number[];
  pickups: readonly PickupTemplate[];
  decorations: readonly DecorationTemplate[];
  hazards: readonly [];
  tags: readonly ChunkTag[];
}

const connection = (platformIndex: number, laneOffset: number): ChunkConnection => ({ platformIndex, laneOffset });

export const HANDCRAFTED_CHUNK_TEMPLATES: readonly ChunkTemplate[] = [
  {
    id: 'safe-flat', difficulty: 0, width: 760,
    entry: connection(0, 0), exit: connection(0, 0),
    platforms: [{ x: 0, laneOffset: 0, width: 760, route: 'main' }],
    mainRoute: [0], pickups: [],
    decorations: [{ type: 'lantern', platformIndex: 0, horizontalAnchor: 'right', variants: [1, 2] }],
    hazards: [], tags: ['easy', 'flat'],
  },
  {
    id: 'small-gap', difficulty: 0.2, width: 760,
    entry: connection(0, 0), exit: connection(1, 0),
    platforms: [
      { x: 0, laneOffset: 0, width: 300, route: 'main', varyWidth: true },
      { x: 390, laneOffset: 0, width: 370, route: 'main', varyWidth: true },
    ],
    mainRoute: [0, 1], pickups: [],
    decorations: [{ type: 'sign', platformIndex: 0, horizontalAnchor: 'right' }],
    hazards: [], tags: ['easy', 'gap'],
  },
  {
    id: 'two-step-up', difficulty: 0.26, width: 900,
    entry: connection(0, 0), exit: connection(2, 1),
    platforms: [
      { x: 0, laneOffset: 0, width: 250, route: 'main', varyWidth: true },
      { x: 310, laneOffset: 1, width: 250, route: 'main', varyWidth: true },
      { x: 620, laneOffset: 1, width: 280, route: 'main', varyWidth: true },
    ],
    mainRoute: [0, 1, 2], pickups: [],
    decorations: [{ type: 'shrub', platformIndex: 2, horizontalAnchor: 'right', varyHorizontal: true, variants: [1, 2, 3] }],
    hazards: [], tags: ['ascending'],
  },
  {
    id: 'two-step-down', difficulty: 0.26, width: 900,
    entry: connection(0, 0), exit: connection(2, -1),
    platforms: [
      { x: 0, laneOffset: 0, width: 250, route: 'main', varyWidth: true },
      { x: 310, laneOffset: -1, width: 250, route: 'main', varyWidth: true },
      { x: 620, laneOffset: -1, width: 280, route: 'main', varyWidth: true },
    ],
    mainRoute: [0, 1, 2], pickups: [],
    decorations: [{ type: 'rocks', platformIndex: 2, horizontalAnchor: 'center', variants: [1, 2] }],
    hazards: [], tags: ['descending'],
  },
  {
    id: 'medium-gap', difficulty: 0.55, width: 835,
    entry: connection(0, 0), exit: connection(1, 0),
    platforms: [
      { x: 0, laneOffset: 0, width: 300, route: 'main', varyWidth: true },
      { x: 445, laneOffset: 0, width: 390, route: 'main', varyWidth: true },
    ],
    mainRoute: [0, 1], pickups: [],
    decorations: [{ type: 'sign', platformIndex: 0, horizontalAnchor: 'right' }],
    hazards: [], tags: ['gap', 'large-gap', 'technical'],
  },
  {
    id: 'elevated-optional-route', difficulty: 0.5, width: 860,
    entry: connection(0, 0), exit: connection(1, 0),
    platforms: [
      { x: 0, laneOffset: 0, width: 360, route: 'main', varyWidth: true },
      { x: 440, laneOffset: 0, width: 420, route: 'main', varyWidth: true },
      { x: 250, laneOffset: 1, width: 220, route: 'optional' },
    ],
    mainRoute: [0, 1], optionalRoute: [0, 2, 1],
    pickups: [{ platformIndex: 2, localOffsetX: 110, type: 'random', chance: 0.55 }],
    decorations: [{ type: 'sign', platformIndex: 0, horizontalAnchor: 'center' }],
    hazards: [], tags: ['vertical', 'split', 'upper-route'],
  },
  {
    id: 'ability-upper-platform', difficulty: 0.45, width: 860,
    entry: connection(0, 0), exit: connection(1, 0),
    platforms: [
      { x: 0, laneOffset: 0, width: 340, route: 'main', varyWidth: true },
      { x: 430, laneOffset: 0, width: 430, route: 'main', varyWidth: true },
      { x: 305, laneOffset: 1, width: 230, route: 'optional' },
    ],
    mainRoute: [0, 1], optionalRoute: [0, 2, 1],
    pickups: [{ platformIndex: 2, localOffsetX: 115, type: 'random' }],
    decorations: [{ type: 'shrub', platformIndex: 1, horizontalAnchor: 'right', varyHorizontal: true, variants: [1, 2, 3] }],
    hazards: [], tags: ['vertical', 'upper-route', 'ability'],
  },
  {
    id: 'staggered-platforms', difficulty: 0.3, width: 1_080,
    entry: connection(0, 0), exit: connection(3, 0),
    platforms: [
      { x: 0, laneOffset: 0, width: 250, route: 'main', varyWidth: true },
      { x: 310, laneOffset: 0, width: 220, route: 'main', varyWidth: true },
      { x: 590, laneOffset: 1, width: 220, route: 'main', varyWidth: true },
      { x: 870, laneOffset: 0, width: 210, route: 'main', varyWidth: true },
    ],
    mainRoute: [0, 1, 2, 3], pickups: [], decorations: [], hazards: [],
    tags: ['vertical', 'technical'],
  },
  {
    id: 'recovery-flat', difficulty: 0.1, width: 900,
    entry: connection(0, 0), exit: connection(0, 0),
    platforms: [{ x: 0, laneOffset: 0, width: 900, route: 'main' }],
    mainRoute: [0], pickups: [],
    decorations: [
      { type: 'bench', platformIndex: 0, horizontalAnchor: 'center', variants: [1, 2] },
      { type: 'lantern', platformIndex: 0, horizontalAnchor: 'right', variants: [1, 2] },
    ],
    hazards: [], tags: ['easy', 'flat', 'recovery'],
  },
  {
    id: 'low-high-low', difficulty: 0.28, width: 1_040,
    entry: connection(0, 0), exit: connection(2, 0),
    platforms: [
      { x: 0, laneOffset: 0, width: 300, route: 'main', varyWidth: true },
      { x: 360, laneOffset: 1, width: 260, route: 'main', varyWidth: true },
      { x: 680, laneOffset: 0, width: 360, route: 'main', varyWidth: true },
    ],
    mainRoute: [0, 1, 2], pickups: [],
    decorations: [{ type: 'shrub', platformIndex: 1, horizontalAnchor: 'center', varyHorizontal: true, variants: [1, 2, 3] }],
    hazards: [], tags: ['vertical', 'technical'],
  },
  {
    id: 'split-route', difficulty: 0.8, width: 900,
    entry: connection(0, 0), exit: connection(1, 0),
    platforms: [
      { x: 0, laneOffset: 0, width: 300, route: 'main', varyWidth: true },
      { x: 410, laneOffset: 0, width: 490, route: 'main', varyWidth: true },
      { x: 255, laneOffset: 1, width: 220, route: 'optional' },
      { x: 520, laneOffset: 1, width: 220, route: 'optional' },
    ],
    mainRoute: [0, 1], optionalRoute: [0, 2, 3, 1],
    pickups: [{ platformIndex: 3, localOffsetX: 110, type: 'random', chance: 0.7 }],
    decorations: [{ type: 'sign', platformIndex: 0, horizontalAnchor: 'center' }],
    hazards: [], tags: ['split', 'technical', 'upper-route'],
  },
  {
    id: 'obstacle-flat', difficulty: 0.3, width: 800,
    entry: connection(0, 0), exit: connection(0, 0),
    platforms: [{ x: 0, laneOffset: 0, width: 800, route: 'main' }],
    mainRoute: [0], pickups: [],
    decorations: [
      { type: 'rocks', platformIndex: 0, horizontalAnchor: 'center', variants: [1, 2] },
      { type: 'shrub', platformIndex: 0, horizontalAnchor: 'right', varyHorizontal: true, variants: [1, 2, 3] },
    ],
    hazards: [], tags: ['easy', 'flat', 'technical', 'obstacle'],
  },
] as const;

export function findChunkTemplate(templateId: string) {
  return HANDCRAFTED_CHUNK_TEMPLATES.find((template) => template.id === templateId);
}
