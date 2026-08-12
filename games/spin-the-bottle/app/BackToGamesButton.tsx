interface Props {
  roomIsHost: boolean;
  onReturn: () => void;
}

export function BackToGamesButton({ roomIsHost, onReturn }: Props) {
  if (!roomIsHost) return null;

  return <button className="back-to-games-button" type="button" onClick={onReturn}>OYUNLARA DÖN</button>;
}
