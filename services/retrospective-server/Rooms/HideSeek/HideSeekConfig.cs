namespace Retrospective.Server.Rooms.HideSeek;

/// <summary>
/// Every tunable Saklambaç number, mirroring
/// <c>games/hide-and-seek/src/domain/config.ts</c> — keep the two in sync by
/// hand (same precedent as <see cref="RoomManager"/>'s duplicated
/// <c>DrawAndGuessWords</c>). Nothing here is meant to be inlined into
/// gameplay code.
/// </summary>
public static class HideSeekConfig
{
    /// <summary>World-space size of one map tile, in pixels. Must match the map file's own tileSize.</summary>
    public const int TileSize = 20;
    /// <summary>Authoritative server simulation rate, ticks per second.</summary>
    public const int TickRate = 20;
    public static readonly TimeSpan TickInterval = TimeSpan.FromSeconds(1.0 / TickRate);
    /// <summary>How far (in tiles) a player can see, both for fog and for who is visible.</summary>
    public const int VisionRadius = 4;
    /// <summary>Hider movement speed, px/sec.</summary>
    public const double PlayerSpeed = 140;
    /// <summary>Seeker speed as a multiplier of PlayerSpeed.</summary>
    public const double SeekerSpeedMultiplier = 1.2;
    /// <summary>Half-width of a player's collision box, in px.</summary>
    public const double PlayerRadius = 7;

    public const int PrepDurationSec = 10;
    public const int GameDurationSec = 180;
    public const int DarkDurationSec = 45;
    public const int RevealDurationSec = 15;
    public const int RevealWarningSec = 5;

    public const double CatchRadiusPx = 32;
    public const double CatchDurationSec = 1.0;
    public const double CatchGraceSec = 0.3;

    public const int MinPlayers = 3;
    public const int MaxPlayers = 10;

    /// <summary>
    /// Saklambaç-specific reconnect window — deliberately separate from the
    /// room-wide seat grace (<see cref="RoomOptions.DisconnectGraceSeconds"/>,
    /// 25s by default), which governs the lobby seat/host election, not
    /// round participation. A hider who doesn't come back within this window
    /// is removed from the round as a neutral drop-out: never counted as a
    /// catch for the seeker, never counted as "alive" for the hiders' win
    /// condition either.
    /// </summary>
    public const int DisconnectGraceSec = 10;
}
