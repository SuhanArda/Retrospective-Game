type PlayerIdentity = Readonly<{
  id: string;
  name: string;
}>;

const unknownSelectedPlayer = "Seçilen oyuncu";

export function resolveSelectedPlayerName(
  players: readonly PlayerIdentity[],
  selectedIndex: number | null,
  authoritativePlayerId?: string,
): string {
  if (authoritativePlayerId) {
    return players.find(({ id }) => id === authoritativePlayerId)?.name ?? unknownSelectedPlayer;
  }

  if (selectedIndex === null) return "";
  return players[selectedIndex]?.name ?? unknownSelectedPlayer;
}

export function toTurkishUpperCase(value: string): string {
  return value.toLocaleUpperCase("tr-TR");
}
