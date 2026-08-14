import type { RoomPlayerSnapshot } from '@retro-platform/contracts';

/** One opponent the scene will draw a character for. */
export interface RouletteSeat {
  id: string;
  name: string;
  sprite: string;
}

/**
 * How many opponents the row will hold. A room can be opened for far more
 * people than that; past this many the row is unreadable regardless of how
 * much the figures shrink to fit.
 */
export const MAX_OPPONENTS_DRAWN = 8;

/** The 13 generated character sprites, in file order (char-01 .. char-13). */
export const CHARACTER_SPRITES = Array.from({ length: 13 }, (_, i) => `char-${String(i + 1).padStart(2, '0')}`);

/**
 * A stable, deterministic hash so the same player always gets the same
 * sprite from one client to the next — nothing here talks to the server for
 * this, it just has to agree with itself everywhere it runs. Exported so the
 * scene can look up the local player's own sprite for the "SEN" portrait,
 * the same way it looks up everyone else's.
 */
export function spriteFor(playerId: string): string {
  let hash = 0;
  for (let i = 0; i < playerId.length; i++) hash = (hash * 31 + playerId.charCodeAt(i)) >>> 0;
  return CHARACTER_SPRITES[hash % CHARACTER_SPRITES.length]!;
}

/**
 * Gives every id in `playerIds` a sprite, walking them in the order given
 * (the room's own roster order, so every client resolves the same way) and
 * handing out each one's hash-preferred sprite from `spriteFor` — unless
 * it's already taken, in which case they get bumped forward to the next
 * free one in the 18-character set. With no collision this is identical to
 * `spriteFor`, which is what keeps a reconnecting player recognizable; it
 * only diverges for whoever loses a collision, and only while that
 * collision actually exists.
 */
function resolveSpriteCollisions(playerIds: readonly string[]): Map<string, string> {
  const used = new Set<string>();
  const assigned = new Map<string, string>();
  for (const id of playerIds) {
    const preferred = spriteFor(id);
    const startIndex = CHARACTER_SPRITES.indexOf(preferred);
    let sprite = preferred;
    for (let offset = 0; offset < CHARACTER_SPRITES.length; offset++) {
      const candidate = CHARACTER_SPRITES[(startIndex + offset) % CHARACTER_SPRITES.length]!;
      if (!used.has(candidate)) { sprite = candidate; break; }
    }
    used.add(sprite);
    assigned.set(id, sprite);
  }
  return assigned;
}

/**
 * The set whose sprites get resolved together, in the room's own roster
 * order — deliberately NOT reordered around whichever player is asking.
 * It used to put the local player first (so "my" collisions always
 * resolved in my own favor), which meant two different clients viewing the
 * exact same roster could disagree about who got bumped: everyone saw
 * themselves win their own ties, so the same person could show up as one
 * character on their own screen and a different one on someone else's.
 * Server order is the one thing every client actually agrees on, so
 * resolving against it — untouched — is what makes the result identical
 * everywhere.
 */
function drawnRoster(roster: readonly RoomPlayerSnapshot[]): readonly RoomPlayerSnapshot[] {
  return roster.slice(0, MAX_OPPONENTS_DRAWN + 1);
}

function assignedSprites(roster: readonly RoomPlayerSnapshot[] | null): Map<string, string> {
  if (!roster) return new Map();
  return resolveSpriteCollisions(drawnRoster(roster).map((player) => player.id));
}

/**
 * Turns the room's players into the opponents this client draws. The local
 * player is deliberately excluded from the row — the whole point of this
 * game's camera is that you see everyone else, never yourself — but their
 * presence still counts when resolving sprite collisions, so nobody at the
 * table accidentally looks like you.
 */
export function buildOpponentSeats(
  roster: readonly RoomPlayerSnapshot[] | null,
  localPlayerId: string | null,
): RouletteSeat[] {
  if (!roster) return [];
  const sprites = assignedSprites(roster);
  return roster
    .filter((player) => player.id !== localPlayerId)
    .slice(0, MAX_OPPONENTS_DRAWN)
    .map((player) => ({ id: player.id, name: player.displayName, sprite: sprites.get(player.id) ?? spriteFor(player.id) }));
}

/**
 * The local player's own sprite for the "SEN" portrait, resolved against the
 * same pool as the opponents actually drawn — so "you" never happens to
 * match someone sitting at the table, even though you never render in the
 * row yourself.
 */
export function spriteForLocalPlayer(
  roster: readonly RoomPlayerSnapshot[] | null,
  localPlayerId: string | null,
): string {
  if (!localPlayerId) return CHARACTER_SPRITES[0]!;
  if (!roster) return spriteFor(localPlayerId);
  return assignedSprites(roster).get(localPlayerId) ?? spriteFor(localPlayerId);
}
