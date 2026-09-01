/**
 * Every tunable Saklambaç number lives here — nothing below is meant to be
 * hand-tuned by editing gameplay code. The C# mirror is
 * `services/retrospective-server/Rooms/HideSeek/HideSeekConfig.cs` (added in
 * Faz 3); keep the two in sync by hand the same way other cross-language
 * constants in this repo are (see `RoomManager.cs`'s `DrawAndGuessWords`
 * comment for the precedent).
 */
export const HideSeekConfig = {
  /**
   * World-space size of one map tile, in pixels. Started at the spec's 32
   * and was sized back down to 20 — at 32 the map read as oversized and
   * every tile edge looked like a big, chunky pixel-art square instead of a
   * smooth floor. Must match `classic.json`'s own `tileSize` field (kept in
   * sync by hand, same as everything else duplicated between the map file
   * and this config).
   */
  TILE_SIZE: 20,
  /** Authoritative server simulation rate, ticks per second. */
  TICK_RATE: 20,
  /** How far (in tiles) a player can see, both for fog and for who is visible. */
  VISION_RADIUS: 4,
  /** Hider movement speed, px/sec. */
  PLAYER_SPEED: 140,
  /** Seeker speed as a multiplier of PLAYER_SPEED. */
  SEEKER_SPEED_MULT: 1.2,
  /** Half-width of a player's collision box, in px — kept well under half a
   * tile (10px) so two players can still pass each other in a corridor. */
  PLAYER_RADIUS: 7,

  /** Seeker is picked and announced; hiders may move, seeker is frozen. */
  PREP_DURATION_SEC: 10,
  /** Total round length once PREP ends. */
  GAME_DURATION_SEC: 180,
  /** One DARK phase's length within the DARK/REVEAL cycle. */
  DARK_DURATION_SEC: 45,
  /** One REVEAL (everyone-sees-everyone) phase's length. */
  REVEAL_DURATION_SEC: 15,
  /** How long before a REVEAL starts that clients should show a warning countdown. */
  REVEAL_WARNING_SEC: 5,

  /** A hider within this many px of the seeker is eligible to be caught. */
  CATCH_RADIUS_PX: 32,
  /**
   * Total seconds of seeker contact needed to land a catch — a health bar
   * accumulated across the *whole round*, not a sustained-contact timer.
   * Breaking contact only pauses it (stops it climbing); it never falls
   * back down. Two separate ten-second-apart brushes of half a second each
   * catch a hider exactly as surely as one full second held in one go.
   */
  CATCH_DURATION_SEC: 2.0,

  MIN_PLAYERS: 3,
  MAX_PLAYERS: 10,

  /**
   * Saklambaç-specific reconnect window — deliberately separate from the
   * room-wide seat grace (`RoomOptions.DisconnectGraceSeconds`, 25s), which
   * governs the lobby seat/host election, not round participation. If a
   * hider doesn't come back within this window they're removed from the
   * round as a neutral drop-out (never counted as a catch for the seeker,
   * never counted as "alive" for the hiders' win condition either).
   */
  DISCONNECT_GRACE_SEC: 10,
} as const;
