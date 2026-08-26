import { describe, expect, it } from "vitest";
import { getCatSeatPosition, getSpinTargetAngle, MAX_SPIN_PLAYERS } from "./catLayout";

describe("Spin the Bottle cat layout", () => {
  it.each([1, 4, 5, 8, 10])("distributes %i players around one ellipse", (playerCount) => {
    const seats = Array.from({ length: playerCount }, (_, index) =>
      getCatSeatPosition(index, playerCount),
    );

    expect(seats).toHaveLength(playerCount);
    expect(new Set(seats.map(({ xPercent, yPercent }) => `${xPercent}:${yPercent}`)).size).toBe(playerCount);
    expect(seats[0].xPercent).toBe(50);
    expect(seats[0].yPercent).toBeLessThan(50);
    seats.forEach(({ xPercent, yPercent }) => {
      expect(xPercent).toBeGreaterThanOrEqual(0);
      expect(xPercent).toBeLessThanOrEqual(100);
      expect(yPercent).toBeGreaterThanOrEqual(0);
      expect(yPercent).toBeLessThanOrEqual(100);
    });
  });

  it("keeps the bottle angle aligned with each of ten seats", () => {
    expect(Array.from({ length: 10 }, (_, index) => getSpinTargetAngle(index, 10)))
      .toEqual([0, 36, 72, 108, 144, 180, 216, 252, 288, 324]);
  });

  it("keeps the back cat below the fireplace without pushing the front cat off the rug", () => {
    expect(getCatSeatPosition(0, 4).yPercent).toBe(32);
    expect(getCatSeatPosition(2, 4).yPercent).toBe(92);
  });

  it("rounds non-integer seven-player angles consistently", () => {
    expect(Array.from({ length: 7 }, (_, index) => getSpinTargetAngle(index, 7)))
      .toEqual([0, 51, 103, 154, 206, 257, 309]);
  });

  it("rejects counts outside the supported multiplayer range", () => {
    expect(() => getCatSeatPosition(0, 0)).toThrow(RangeError);
    expect(() => getCatSeatPosition(0, MAX_SPIN_PLAYERS + 1)).toThrow(RangeError);
  });
});
