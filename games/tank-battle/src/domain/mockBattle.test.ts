import { describe, expect, it } from 'vitest';
import {
  advanceMockTankPhysics,
  createMockBattle,
  fireMockShot,
  moveMockTank,
  resetMockRound,
  resolveMockShot,
  terrainAt,
} from './mockBattle';

describe('tank battle domain', () => {
  it('places every tank on deterministic terrain and balanced teams', () => {
    const battle = createMockBattle();
    expect(battle.mapWidth).toBe(1280);
    expect(battle.mapHeight - battle.waterY).toBe(70);
    expect(battle.players.filter((player) => player.team === 'RED')).toHaveLength(2);
    expect(battle.players.filter((player) => player.team === 'BLUE')).toHaveLength(2);
    expect(battle.players[1]!.x - battle.players[0]!.x).toBeGreaterThan(180);
    for (const tank of battle.players) expect(tank.y).toBeCloseTo(terrainAt(battle, tank.x) - 12);
  });

  it('moves by one bounded server-sized step', () => {
    const battle = createMockBattle();
    const moved = moveMockTank(battle, 'local', 1);
    expect(moved.players.find((player) => player.playerId === 'local')?.x).toBe(152);
    expect(moved.players.find((player) => player.playerId === 'local')?.facing).toBe('RIGHT');
    const turned = moveMockTank(moved, 'local', -1);
    expect(turned.players.find((player) => player.playerId === 'local')?.facing).toBe('LEFT');
  });

  it('allows teammates to overlap but keeps enemy tanks solid', () => {
    const battle = createMockBattle();
    const teammatesTogether = {
      ...battle,
      players: battle.players.map((player) => {
        if (player.playerId === 'local') return { ...player, x: 100 };
        if (player.playerId === 'red-bot') return { ...player, x: 112 };
        return player;
      }),
    };
    const overlapping = moveMockTank(teammatesTogether, 'local', 1);
    expect(overlapping.players.find((player) => player.playerId === 'local')?.x).toBe(112);

    const enemiesTogether = {
      ...battle,
      players: battle.players.map((player) => {
        if (player.playerId === 'local') return { ...player, x: 100 };
        if (player.playerId === 'red-bot') return { ...player, x: 400 };
        if (player.playerId === 'blue-bot-1') return { ...player, x: 112 };
        return player;
      }),
    };
    const blocked = moveMockTank(enemiesTogether, 'local', 1);
    expect(blocked.players.find((player) => player.playerId === 'local')?.x).toBe(100);
  });

  it('keeps terrain unchanged during flight and applies one crater at impact', () => {
    const battle = createMockBattle();
    const fired = fireMockShot(battle, 'local', 45, 360);
    expect(fired.lastShot?.path.length).toBeGreaterThan(4);
    expect(fired.lastShot?.path[1]?.y).toBeLessThan(fired.lastShot?.path[0]?.y ?? 0);
    expect(fired.lastShot?.status).toBe('ACTIVE');
    expect(fired.terrainHeights).toEqual(battle.terrainHeights);
    expect(fired.players.map((player) => player.health)).toEqual(battle.players.map((player) => player.health));

    const impacted = resolveMockShot(fired, fired.lastShot!.shotId);
    expect(impacted.lastShot?.status).toBe('IMPACTED');
    expect(impacted.terrainHeights).not.toEqual(battle.terrainHeights);
    expect(resolveMockShot(impacted, fired.lastShot!.shotId)).toBe(impacted);
  });

  it('launches a tank only when its nearby downward shot impacts, then lands it', () => {
    const battle = createMockBattle();
    const fired = fireMockShot(battle, 'local', -35, 220);
    const beforeImpact = fired.players.find((tank) => tank.playerId === 'local')!;
    expect(beforeImpact.airborne).toBe(false);

    let current = resolveMockShot(fired, fired.lastShot!.shotId);
    const launched = current.players.find((tank) => tank.playerId === 'local')!;
    expect(launched.airborne).toBe(true);
    expect(launched.velocityY).toBeLessThan(-40);
    expect(launched.velocityY).toBeGreaterThanOrEqual(-280);
    expect(launched.health).toBe(3);

    let highestY = launched.y;
    for (let step = 0; step < 60 && current.players.find((tank) => tank.playerId === 'local')?.airborne; step++) {
      current = advanceMockTankPhysics(current, 0.1);
      highestY = Math.min(highestY, current.players.find((tank) => tank.playerId === 'local')!.y);
    }
    const landed = current.players.find((tank) => tank.playerId === 'local')!;
    expect(landed.airborne).toBe(false);
    expect(highestY).toBeLessThan(launched.y - 15);
    expect(landed.y).toBeCloseTo(terrainAt(current, landed.x) - 12);
  });

  it('does not launch a tank from a distant impact', () => {
    const battle = createMockBattle();
    const fired = fireMockShot(battle, 'local', 45, 620);
    const resolved = resolveMockShot(fired, fired.lastShot!.shotId);
    expect(resolved.players.find((tank) => tank.playerId === 'local')?.airborne).toBe(false);
  });

  it('does not deform terrain when a projectile exits the world', () => {
    const battle = createMockBattle();
    const facingLeft = {
      ...battle,
      players: battle.players.map((player) => player.playerId === 'local' ? { ...player, facing: 'LEFT' as const } : player),
    };
    const fired = fireMockShot(facingLeft, 'local', 45, 620);
    expect(fired.lastShot?.impactType).toBe('OUT_OF_BOUNDS');

    const missed = resolveMockShot(fired, fired.lastShot!.shotId);
    expect(missed.lastShot?.status).toBe('MISSED');
    expect(missed.terrainHeights).toEqual(battle.terrainHeights);
  });

  it('starts a clean synchronized round after the spoken question', () => {
    const battle = createMockBattle();
    const finished = {
      ...battle,
      phase: 'QUESTION' as const,
      players: battle.players.map((player) => ({ ...player, health: 0, alive: false })),
      activeQuestion: { questionId: 'q1', questionIndex: 0, loserTeam: 'BLUE' as const, answeredPlayerIds: [] },
    };
    const next = resetMockRound(finished);
    expect(next.roundNumber).toBe(2);
    expect(next.phase).toBe('RUNNING');
    expect(next.activeQuestion).toBeUndefined();
    expect(next.players.every((player) => player.alive && player.health === 3)).toBe(true);
  });
});
