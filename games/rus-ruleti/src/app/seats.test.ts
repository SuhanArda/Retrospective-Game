import { describe, expect, it } from 'vitest';
import type { RoomPlayerSnapshot } from '@retro-platform/contracts';
import { buildOpponentSeats, CHARACTER_SPRITES, MAX_OPPONENTS_DRAWN, spriteFor, spriteForLocalPlayer } from './seats';

const player = (id: string, overrides: Partial<RoomPlayerSnapshot> = {}): RoomPlayerSnapshot => ({
  id,
  displayName: id.toUpperCase(),
  color: '#5b2a86',
  isHost: false,
  isReady: true,
  isConnected: true,
  joinedAt: 0,
  ...overrides,
});

/** Finds two ids whose hash-preferred sprite genuinely collides, so the collision tests below exercise the real code path instead of hoping a hardcoded pair happens to still collide. */
function findCollidingIds(): [string, string] {
  const seen = new Map<string, string>();
  for (let i = 0; ; i++) {
    const id = `player-${i}`;
    const sprite = spriteFor(id);
    const earlier = seen.get(sprite);
    if (earlier) return [earlier, id];
    seen.set(sprite, id);
  }
}

describe('buildOpponentSeats', () => {
  it('never draws the local player as an opponent', () => {
    const seats = buildOpponentSeats([player('p1'), player('p2')], 'p1');
    expect(seats.map((seat) => seat.id)).toEqual(['p2']);
  });

  it('gives every opponent a real name and a sprite', () => {
    const [seat] = buildOpponentSeats([player('p1', { displayName: 'Bahadır' }), player('p2')], 'p2');
    expect(seat).toMatchObject({ id: 'p1', name: 'Bahadır' });
    expect(CHARACTER_SPRITES).toContain(seat?.sprite);
  });

  it('is empty when there is no roster yet', () => {
    expect(buildOpponentSeats(null, 'p1')).toEqual([]);
  });

  it('caps the row at MAX_OPPONENTS_DRAWN', () => {
    const roster = Array.from({ length: MAX_OPPONENTS_DRAWN + 4 }, (_, i) => player(`p${i}`));
    expect(buildOpponentSeats(roster, 'p0')).toHaveLength(MAX_OPPONENTS_DRAWN);
  });

  it('gives the same player the same sprite every time, so reconnecting keeps them recognizable', () => {
    const first = buildOpponentSeats([player('p1'), player('stable-id')], 'p1');
    const second = buildOpponentSeats([player('p2'), player('stable-id')], 'p2');
    expect(first[0]?.sprite).toBe(second[0]?.sprite);
  });

  it('bumps a later player to a different sprite when their hash-preferred one is already taken', () => {
    const [firstId, secondId] = findCollidingIds();
    expect(spriteFor(firstId)).toBe(spriteFor(secondId)); // sanity: they really do collide
    const seats = buildOpponentSeats([player(firstId), player(secondId), player('you')], 'you');
    const sprites = seats.map((seat) => seat.sprite);
    expect(new Set(sprites).size).toBe(sprites.length);
    // Whoever the roster lists first keeps their natural sprite; the loser gets bumped.
    expect(seats.find((seat) => seat.id === firstId)?.sprite).toBe(spriteFor(firstId));
  });

  it('never gives the local player the same sprite as someone drawn at the table', () => {
    const [firstId, secondId] = findCollidingIds();
    // The local player is the one who'd naturally collide — worth checking they still get bumped away from their own opponent.
    const roster = [player(firstId), player(secondId)];
    const opponents = buildOpponentSeats(roster, secondId);
    const youSprite = spriteForLocalPlayer(roster, secondId);
    expect(opponents.map((seat) => seat.sprite)).not.toContain(youSprite);
  });

  it('resolves the same sprite for a player no matter whose client is looking (this used to differ per viewer — the reported sync bug)', () => {
    const [firstId, secondId] = findCollidingIds();
    const roster = [player(firstId), player(secondId)];

    // firstId's own self-view (as if firstId were the local player)...
    const firstSelfView = spriteForLocalPlayer(roster, firstId);
    // ...must match what secondId's client draws for firstId as an opponent.
    const firstAsOpponentForSecond = buildOpponentSeats(roster, secondId).find((seat) => seat.id === firstId)?.sprite;
    expect(firstAsOpponentForSecond).toBe(firstSelfView);

    // And the same has to hold the other way around.
    const secondSelfView = spriteForLocalPlayer(roster, secondId);
    const secondAsOpponentForFirst = buildOpponentSeats(roster, firstId).find((seat) => seat.id === secondId)?.sprite;
    expect(secondAsOpponentForFirst).toBe(secondSelfView);
  });
});
