interface MuteButtonProps {
  muted: boolean;
  onToggle: () => void;
}

/** Always visible (unlike `ReturnToLobbyButton`, this isn't host-only) — every player has their own audio to control, independent of anyone else's. */
export function MuteButton({ muted, onToggle }: MuteButtonProps) {
  return (
    <button
      type="button"
      className="mute-button"
      onClick={onToggle}
      aria-label={muted ? 'Sesi aç' : 'Sesi kapat'}
      aria-pressed={muted}
    >
      {muted ? '🔇' : '🔊'}
    </button>
  );
}
