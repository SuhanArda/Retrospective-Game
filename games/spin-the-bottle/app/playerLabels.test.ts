import { describe, expect, it } from "vitest";
import { resolveSelectedPlayerName, toTurkishUpperCase } from "./playerLabels";

const players = [
  { id: "player-a", name: "Ayşe" },
  { id: "player-b", name: "İpek" },
  { id: "player-c", name: "Çağrı" },
];

describe("Spin the Bottle player labels", () => {
  it("uses the selected index in a standalone game", () => {
    expect(resolveSelectedPlayerName(players, 1)).toBe("İpek");
  });

  it("prioritizes the authoritative player id in an online room", () => {
    expect(resolveSelectedPlayerName(players, 1, "player-c")).toBe("Çağrı");
  });

  it("does not show a potentially incorrect player number while an online player is loading", () => {
    expect(resolveSelectedPlayerName(players, 1, "missing-player")).toBe("Seçilen oyuncu");
  });

  it("uppercases Turkish names correctly", () => {
    expect(toTurkishUpperCase("İpek ışık")).toBe("İPEK IŞIK");
  });
});
