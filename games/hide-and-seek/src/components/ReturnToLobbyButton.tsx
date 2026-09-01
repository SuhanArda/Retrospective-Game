interface ReturnToLobbyButtonProps {
  isHost: boolean;
  onReturn: () => void;
}

/**
 * Persistent, host-only "back to the lobby" control — visible for the whole
 * round, not just once it's ended. Same idea as retro-rush's
 * `BackToGamesButton`: a host stuck mid-round (nobody wants to finish, a
 * player dropped and the round is dead) shouldn't have to wait for
 * `ResultsScreen`'s own return button, which only ever shows up once the
 * round has already ended.
 */
export function ReturnToLobbyButton({ isHost, onReturn }: ReturnToLobbyButtonProps) {
  if (!isHost) return null;
  return (
    <button type="button" className="return-to-lobby-button" onClick={onReturn}>
      Lobiye Dön
    </button>
  );
}
