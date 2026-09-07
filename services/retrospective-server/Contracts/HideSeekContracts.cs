namespace Retrospective.Server.Contracts;

/// <summary>
/// The non-secret half of a Saklambaç round — who's the seeker, the phase
/// and its countdown, who's been caught, and who won. Deliberately never
/// carries a position: those go through <see cref="HideAndSeekPersonalSnapshot"/>,
/// unicast per connection and filtered by <c>HideSeekVision</c> — except
/// during <c>REVEAL</c> (and for a caught spectator), when the filter is off.
/// </summary>
public sealed record HideAndSeekStateSnapshot(
    string SeekerPlayerId,
    /// <summary>"PREP" | "DARK" | "REVEAL" | "ENDED".</summary>
    string Phase,
    /// <summary>When the current phase ends — a display-only countdown target, never itself an authority: the phase field is what actually changed, this just says when the next change is due.</summary>
    long PhaseEndsAtUtc,
    /// <summary>When the whole round ends, decided once at game start (the DARK/REVEAL cycle is sized to land exactly on this).</summary>
    long GameEndsAtUtc,
    /// <summary>Every hider caught so far, in the order they were caught — not secret, everyone in the room already sees a hider vanish into spectator mode.</summary>
    IReadOnlyList<string> CaughtPlayerIds,
    /// <summary>"SEEKER" | "HIDERS" | null while the round is still playing.</summary>
    string? Winner,
    int Revision,
    long UpdatedAtUtc);

/// <summary>
/// Sent once, at game start (and again on rejoin) — the map's row strings
/// plus a hash of the exact file they came from, so a client can tell its
/// own bundled dev copy apart from what the server is actually simulating
/// against. See `HideSeekMap`'s doc comment for why this matters.
/// </summary>
public sealed record HideAndSeekMapPayload(
    string Id,
    int Width,
    int Height,
    int TileSize,
    IReadOnlyList<string> Rows,
    string MapHash);

/// <summary>
/// Client → server, at most `TICK_RATE` times per second: which directions
/// are currently held, never a position. `Seq` is a client-assigned,
/// monotonically increasing counter — the tick loop echoes the highest one
/// it has applied back in <see cref="HideAndSeekPersonalSnapshot"/> so the
/// client knows which of its own predicted inputs are now confirmed.
/// </summary>
public sealed record HideAndSeekInputRequest(bool Up, bool Down, bool Left, bool Right, int Seq);

/// <summary>
/// One other player's authoritative position, as included in someone else's
/// personal snapshot. <see cref="CatchProgress"/> is 0 unless this player is
/// a hider currently within catch range of the seeker — riding along here
/// means it only ever reaches connections whose own vision already includes
/// this player, with no separate broadcast needed.
/// </summary>
/// <param name="IsFullyVisible">
/// True within <c>HideSeekConfig.VisionRadius</c> — the client draws this
/// player's actual token. False means they were only picked up by the
/// wider <c>HideSeekConfig.FootprintSenseRadius</c> check: the client
/// still gets their position (so it can keep laying down footprint marks
/// for the trail), but must not render a token for them — they weren't
/// actually seen, just sensed. Always true during REVEAL or for a
/// spectator, where the vision filter is off entirely.
/// </param>
public sealed record HideAndSeekVisiblePlayer(string PlayerId, string Role, double X, double Y, double CatchProgress, bool IsFullyVisible);

/// <summary>
/// The per-connection payload the game loop unicasts at `TICK_RATE`. Never
/// broadcast to a group — <see cref="VisiblePlayers"/> is whatever this one
/// connection is allowed to see, computed fresh for them alone.
/// </summary>
public sealed record HideAndSeekPersonalSnapshot(
    int LastProcessedSeq,
    double X,
    double Y,
    /// <summary>This player's own catch progress (0..1) if they're currently the one being caught — the red-vignette trigger; a hider only ever sees their own.</summary>
    double CatchProgress,
    /// <summary>True once this player has been caught — they're a spectator now: frozen, full map visibility, no fog.</summary>
    bool IsSpectator,
    IReadOnlyList<HideAndSeekVisiblePlayer> VisiblePlayers);

/// <summary>Group broadcast, fired once per catch — a toast/sound cue for the whole room, not itself secret (everyone already sees the roster shrink).</summary>
public sealed record HideAndSeekPlayerCaughtEvent(string PlayerId, string SeekerPlayerId, int RemainingActiveHiders);
