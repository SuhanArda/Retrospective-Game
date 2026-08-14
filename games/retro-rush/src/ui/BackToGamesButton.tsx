interface Props {
  roomIsHost: boolean;
  onReturn: () => void;
}

export function BackToGamesButton({ roomIsHost, onReturn }: Props) {
  if (!roomIsHost) return null;

  return <button className="button return-to-platform" type="button" onClick={onReturn}>OYUNLARA DÖN</button>;
}
