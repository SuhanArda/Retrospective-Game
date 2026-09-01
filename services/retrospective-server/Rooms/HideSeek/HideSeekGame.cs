using Retrospective.Server.Contracts;

namespace Retrospective.Server.Rooms.HideSeek;

public enum HideSeekRole { Seeker, Hider }

public enum HideSeekPhase { Prep, Dark, Reveal, Ended }

public enum HideSeekPlayerStatus { Active, Caught }

public enum HideSeekWinner { Seeker, Hiders }

public sealed class HideSeekPlayerState
{
    public required string PlayerId { get; init; }
    public required HideSeekRole Role { get; set; }
    public double X { get; set; }
    public double Y { get; set; }
    public bool InputUp { get; set; }
    public bool InputDown { get; set; }
    public bool InputLeft { get; set; }
    public bool InputRight { get; set; }
    public int LastProcessedSeq { get; set; }
    public string? ConnectionId { get; set; }
    public bool Connected { get; set; }
    public HideSeekPlayerStatus Status { get; set; } = HideSeekPlayerStatus.Active;
    /// <summary>Seconds of uninterrupted seeker contact accumulated so far — resets once it either lands a catch or the grace window (below) expires.</summary>
    public double CatchContactSeconds { get; set; }
    /// <summary>Counts down while out of contact; contact resumes without resetting <see cref="CatchContactSeconds"/> as long as this hasn't hit zero.</summary>
    public double CatchGraceRemainingSeconds { get; set; }
    /// <summary>Set when this player disconnects; cleared on reconnect. Once passed, <see cref="HideSeekGame"/> drops them from the round as a neutral dropout — see <see cref="HideSeekConfig.DisconnectGraceSec"/>.</summary>
    public long? DisconnectExpiresAtUtc { get; set; }
}

/// <summary>One connection's worth of tick output — its own reconciled position plus whichever other players it may see.</summary>
public sealed record HideSeekPersonalTick(string PlayerId, string? ConnectionId, HideAndSeekPersonalSnapshot Snapshot);

/// <summary>
/// <see cref="UpdatedPublicState"/> is non-null only on the tick where the
/// public state actually changed (phase, a catch, or the round ending) —
/// the loop service broadcasts it then, not every tick.
/// <see cref="NewCatches"/> is normally empty; a tick lands at most one
/// entry per hider caught that tick.
/// </summary>
public sealed record HideSeekTickResult(
    string RoomCode,
    IReadOnlyList<HideSeekPersonalTick> Players,
    HideAndSeekStateSnapshot? UpdatedPublicState,
    IReadOnlyList<HideAndSeekPlayerCaughtEvent> NewCatches);

/// <summary>
/// One room's Saklambaç round: player roster, authoritative positions,
/// phase timing, and catch/win state. Everything here is internal
/// simulation state — <see cref="RoomManager"/> never reads it directly,
/// only the small, non-secret <see cref="HideAndSeekStateSnapshot"/> handed
/// back at the moments that actually change it.
/// </summary>
public sealed class HideSeekGame
{
    private readonly Lock _gate = new();
    private readonly HideSeekMap _map;
    private readonly TimeProvider _timeProvider;
    private readonly Dictionary<string, HideSeekPlayerState> _players = new(StringComparer.Ordinal);
    private readonly List<string> _caughtPlayerIds = [];
    private readonly int _initialHiderCount;
    private int _revision = 1;
    // Starts equal to _revision, not 0 — StartGame's return value already
    // delivers revision 1 to RoomManager synchronously, so the very first
    // Tick() shouldn't re-report it as if something had just changed.
    private int _notifiedRevision = 1;
    private HideSeekPhase _phase = HideSeekPhase.Prep;
    private long _phaseEndsAtUtc;
    private readonly long _gameEndsAtUtc;
    private HideSeekWinner? _winner;

    public string RoomCode { get; }
    public string SeekerPlayerId { get; }

    public HideSeekGame(string roomCode, HideSeekMap map, IReadOnlyList<(string PlayerId, string? ConnectionId)> roster, IRoomRandom random, TimeProvider timeProvider)
    {
        RoomCode = roomCode;
        _map = map;
        _timeProvider = timeProvider;
        if (roster.Count == 0) throw new ArgumentException("hide-and-seek needs at least one player to start", nameof(roster));

        var seekerIndex = random.Next(roster.Count);
        SeekerPlayerId = roster[seekerIndex].PlayerId;

        // Hiders draw spawn tiles from a shuffled copy of the map's spawn
        // list, cycling back around if there are more hiders than spawns.
        var spawnOrder = Enumerable.Range(0, map.HiderSpawns.Count)
            .OrderBy(_ => random.Next(int.MaxValue))
            .ToArray();
        var hiderCursor = 0;

        foreach (var (playerId, connectionId) in roster)
        {
            var isSeeker = playerId == SeekerPlayerId;
            var spawnTile = isSeeker ? map.SeekerSpawn : map.HiderSpawns[spawnOrder[hiderCursor++ % spawnOrder.Length]];
            var (worldX, worldY) = map.TileCenterToWorld(spawnTile);
            _players[playerId] = new HideSeekPlayerState
            {
                PlayerId = playerId,
                Role = isSeeker ? HideSeekRole.Seeker : HideSeekRole.Hider,
                X = worldX,
                Y = worldY,
                ConnectionId = connectionId,
                Connected = connectionId is not null,
            };
        }
        _initialHiderCount = _players.Values.Count(player => player.Role == HideSeekRole.Hider);

        var now = timeProvider.GetUtcNow().ToUnixTimeMilliseconds();
        _phaseEndsAtUtc = now + HideSeekConfig.PrepDurationSec * 1000L;
        // The DARK/REVEAL cycle (45s+15s, three times) is sized to land
        // exactly on GameDurationSec — the last REVEAL and the game itself
        // end together, same as the spec describes. Decided once, here, so
        // every phase transition can clamp against a fixed target instead of
        // drifting tick to tick.
        _gameEndsAtUtc = _phaseEndsAtUtc + HideSeekConfig.GameDurationSec * 1000L;
    }

    public HideAndSeekStateSnapshot GetPublicSnapshot()
    {
        lock (_gate) return BuildPublicSnapshot();
    }

    private HideAndSeekStateSnapshot BuildPublicSnapshot() => new(
        SeekerPlayerId,
        _phase.ToString().ToUpperInvariant(),
        _phaseEndsAtUtc,
        _gameEndsAtUtc,
        _caughtPlayerIds.ToArray(),
        _winner?.ToString().ToUpperInvariant(),
        _revision,
        _timeProvider.GetUtcNow().ToUnixTimeMilliseconds());

    /// <summary>Client input never carries a position — only which directions are held, plus the client's own sequence counter.</summary>
    public void SetInput(string playerId, HideAndSeekInputRequest request)
    {
        lock (_gate)
        {
            if (!_players.TryGetValue(playerId, out var player)) return;
            if (request.Seq <= player.LastProcessedSeq) return; // stale or duplicate — SignalR delivers in order, but never trust that alone
            player.InputUp = request.Up;
            player.InputDown = request.Down;
            player.InputLeft = request.Left;
            player.InputRight = request.Right;
            player.LastProcessedSeq = request.Seq;
        }
    }

    /// <summary>
    /// A disconnect starts Saklambaç's own 10-second reconnect window —
    /// deliberately separate from (and shorter than) the room's 25-second
    /// seat grace, which just governs the lobby seat/host election. If this
    /// player doesn't reconnect before it expires, the next <see cref="Tick"/>
    /// drops them from the round as a neutral dropout (see
    /// <see cref="SweepExpiredDisconnects"/>) — never counted as a catch,
    /// never counted as "still alive" either.
    /// </summary>
    public void SetConnected(string playerId, string? connectionId, bool connected)
    {
        lock (_gate)
        {
            if (!_players.TryGetValue(playerId, out var player)) return;
            player.ConnectionId = connectionId;
            player.Connected = connected;
            if (!connected)
            {
                player.InputUp = player.InputDown = player.InputLeft = player.InputRight = false;
                player.DisconnectExpiresAtUtc = _timeProvider.GetUtcNow().ToUnixTimeMilliseconds() + HideSeekConfig.DisconnectGraceSec * 1000L;
            }
            else
            {
                player.DisconnectExpiresAtUtc = null;
            }
        }
    }

    /// <summary>
    /// Removes a player entirely — used for a normal room Leave (or the
    /// room's own 25s seat-grace expiry), not for Saklambaç's own 10s
    /// reconnect window (that's <see cref="SetConnected"/>, swept by
    /// <see cref="SweepExpiredDisconnects"/>). Safe to call on a player
    /// already gone (e.g. the 10s dropout already removed them) — a no-op.
    /// </summary>
    public void RemovePlayer(string playerId)
    {
        lock (_gate)
        {
            if (_players.Remove(playerId)) HandlePlayerRemoved(playerId);
        }
    }

    /// <summary>
    /// The shared aftermath of any player leaving the round, whichever path
    /// got them there: if it was the seeker, the round ends immediately in
    /// the hiders' favor (reassigning a new seeker mid-round is out of scope
    /// for v1). Otherwise, if the round has fallen below <see cref="HideSeekConfig.MinPlayers"/>,
    /// it's no longer meaningfully playable and ends too — defaulting to the
    /// hiders, since nobody actually caught anybody. Caller must hold <see cref="_gate"/>.
    /// </summary>
    private void HandlePlayerRemoved(string removedPlayerId)
    {
        if (_phase == HideSeekPhase.Ended) return;
        if (removedPlayerId == SeekerPlayerId)
        {
            _phase = HideSeekPhase.Ended;
            _winner = HideSeekWinner.Hiders;
            _revision++;
            return;
        }
        if (_players.Count < HideSeekConfig.MinPlayers)
        {
            _phase = HideSeekPhase.Ended;
            _winner = HideSeekWinner.Hiders;
            _revision++;
        }
    }

    /// <summary>Drops anyone whose 10-second reconnect window (see <see cref="SetConnected"/>) has run out. Caller must hold <see cref="_gate"/>.</summary>
    private void SweepExpiredDisconnects(long nowUtc)
    {
        if (_phase == HideSeekPhase.Ended) return;
        var expired = _players.Values
            .Where(player => player.DisconnectExpiresAtUtc is { } deadline && nowUtc >= deadline)
            .Select(player => player.PlayerId)
            .ToArray(); // materialize first — HandlePlayerRemoved mutates _players
        foreach (var playerId in expired)
        {
            _players.Remove(playerId);
            HandlePlayerRemoved(playerId);
            if (_phase == HideSeekPhase.Ended) break;
        }
    }

    public bool HasPlayers()
    {
        lock (_gate) return _players.Count > 0;
    }

    /// <summary>
    /// One simulation step: advance the phase clock, apply held input to
    /// every connected, still-active player's position (server-authoritative
    /// — the client never sends a position, only intent), resolve seeker
    /// contact into catches, then build each player's personal tick payload.
    /// Who appears in whose payload is filtered per observer by
    /// <see cref="HideSeekVision.IsPlayerVisible"/> — except during
    /// <see cref="HideSeekPhase.Reveal"/> or for a caught spectator, when
    /// everyone is visible to everyone and the filter is skipped entirely.
    /// </summary>
    public HideSeekTickResult Tick(double dtSeconds)
    {
        lock (_gate)
        {
            var nowUtc = _timeProvider.GetUtcNow().ToUnixTimeMilliseconds();
            AdvancePhaseIfNeeded(nowUtc);
            SweepExpiredDisconnects(nowUtc);

            var isPlayablePhase = _phase is HideSeekPhase.Dark or HideSeekPhase.Reveal;
            if (_phase != HideSeekPhase.Ended)
            {
                foreach (var player in _players.Values)
                {
                    if (!player.Connected || player.Status == HideSeekPlayerStatus.Caught) continue;
                    // PREP is the seeker frozen in place while hiders scatter — the
                    // spec's rule, enforced here rather than trusting the client to
                    // simply not send input during this window.
                    if (_phase == HideSeekPhase.Prep && player.Role == HideSeekRole.Seeker) continue;
                    Move(player, dtSeconds);
                }
            }

            var newCatches = isPlayablePhase ? ProcessCatches(dtSeconds) : [];

            var revealsEveryone = _phase == HideSeekPhase.Reveal;
            var results = new List<HideSeekPersonalTick>(_players.Count);
            foreach (var player in _players.Values)
            {
                var isSpectator = player.Status == HideSeekPlayerStatus.Caught;
                var skipVisionFilter = revealsEveryone || isSpectator;
                var (observerTileX, observerTileY) = _map.WorldToTile(player.X, player.Y);
                var others = new List<HideAndSeekVisiblePlayer>();
                foreach (var other in _players.Values)
                {
                    if (other.PlayerId == player.PlayerId) continue;
                    // A caught player is out of the round entirely — nobody
                    // should still see their now-frozen body sitting on the
                    // map. Their own view already turns into a bodyless free
                    // camera (see HideSeekCanvas); this is what makes every
                    // other client's view agree with that.
                    if (other.Status == HideSeekPlayerStatus.Caught) continue;
                    if (!skipVisionFilter)
                    {
                        var (targetTileX, targetTileY) = _map.WorldToTile(other.X, other.Y);
                        if (!HideSeekVision.IsPlayerVisible(_map, observerTileX, observerTileY, targetTileX, targetTileY, HideSeekConfig.VisionRadius)) continue;
                    }
                    var otherCatchProgress = other.Role == HideSeekRole.Hider ? CatchProgressOf(other) : 0;
                    others.Add(new HideAndSeekVisiblePlayer(other.PlayerId, other.Role.ToString().ToUpperInvariant(), other.X, other.Y, otherCatchProgress));
                }
                var ownCatchProgress = player.Role == HideSeekRole.Hider ? CatchProgressOf(player) : 0;
                var snapshot = new HideAndSeekPersonalSnapshot(player.LastProcessedSeq, player.X, player.Y, ownCatchProgress, isSpectator, others);
                results.Add(new HideSeekPersonalTick(player.PlayerId, player.ConnectionId, snapshot));
            }

            HideAndSeekStateSnapshot? updatedPublicState = null;
            if (_revision != _notifiedRevision)
            {
                _notifiedRevision = _revision;
                updatedPublicState = BuildPublicSnapshot();
            }
            return new HideSeekTickResult(RoomCode, results, updatedPublicState, newCatches);
        }
    }

    private static double CatchProgressOf(HideSeekPlayerState hider) =>
        Math.Clamp(hider.CatchContactSeconds / HideSeekConfig.CatchDurationSec, 0, 1);

    /// <summary>
    /// One seeker, so one contact check per hider: within
    /// <see cref="HideSeekConfig.CatchRadiusPx"/> accumulates toward a catch;
    /// outside it burns down a grace window before resetting, so ordinary
    /// network jitter can't undo real progress. Caller must hold <see cref="_gate"/>.
    /// </summary>
    private List<HideAndSeekPlayerCaughtEvent> ProcessCatches(double dtSeconds)
    {
        var caught = new List<HideAndSeekPlayerCaughtEvent>();
        if (!_players.TryGetValue(SeekerPlayerId, out var seeker)) return caught;

        foreach (var hider in _players.Values)
        {
            if (hider.Role != HideSeekRole.Hider || hider.Status != HideSeekPlayerStatus.Active) continue;
            var dx = hider.X - seeker.X;
            var dy = hider.Y - seeker.Y;
            var inContact = Math.Sqrt(dx * dx + dy * dy) <= HideSeekConfig.CatchRadiusPx;

            if (inContact)
            {
                hider.CatchContactSeconds += dtSeconds;
                hider.CatchGraceRemainingSeconds = HideSeekConfig.CatchGraceSec;
                if (hider.CatchContactSeconds >= HideSeekConfig.CatchDurationSec)
                {
                    hider.Status = HideSeekPlayerStatus.Caught;
                    hider.CatchContactSeconds = 0;
                    hider.InputUp = hider.InputDown = hider.InputLeft = hider.InputRight = false;
                    _caughtPlayerIds.Add(hider.PlayerId);
                    _revision++;
                    var remainingActive = _players.Values.Count(p => p.Role == HideSeekRole.Hider && p.Status == HideSeekPlayerStatus.Active);
                    caught.Add(new HideAndSeekPlayerCaughtEvent(hider.PlayerId, SeekerPlayerId, remainingActive));
                }
            }
            else if (hider.CatchGraceRemainingSeconds > 0)
            {
                hider.CatchGraceRemainingSeconds -= dtSeconds;
                if (hider.CatchGraceRemainingSeconds <= 0) hider.CatchContactSeconds = 0;
            }
        }

        if (_initialHiderCount > 0 && _phase != HideSeekPhase.Ended)
        {
            var anyoneStillActive = _players.Values.Any(p => p.Role == HideSeekRole.Hider && p.Status == HideSeekPlayerStatus.Active);
            if (!anyoneStillActive)
            {
                // Every hider that's still part of the round has been caught
                // (a hider who left the room entirely is simply gone, not
                // counted either way — see RemovePlayer).
                _phase = HideSeekPhase.Ended;
                _winner = HideSeekWinner.Seeker;
                _revision++;
            }
        }

        return caught;
    }

    /// <summary>
    /// Advances through as many phase boundaries as <paramref name="nowUtc"/>
    /// has actually passed — a loop, not a single step, so a late tick (a GC
    /// pause, a slow deploy) catches all the way up instead of trickling
    /// through one phase per subsequent tick. Each phase's end is computed
    /// from the *previous* phase's scheduled end, not from whenever a tick
    /// happened to notice, so the timeline never drifts even after a stall.
    /// Caller must hold <see cref="_gate"/>.
    /// </summary>
    private void AdvancePhaseIfNeeded(long nowUtc)
    {
        while (_phase != HideSeekPhase.Ended && nowUtc >= _phaseEndsAtUtc)
        {
            _revision++;
            if (nowUtc >= _gameEndsAtUtc)
            {
                _phase = HideSeekPhase.Ended;
                _phaseEndsAtUtc = _gameEndsAtUtc;
                // Reaching the clock naturally (not an all-caught win the tick
                // before) means at least one hider is still free — theirs.
                _winner ??= HideSeekWinner.Hiders;
                break;
            }

            _phase = _phase switch
            {
                HideSeekPhase.Prep => HideSeekPhase.Dark,
                HideSeekPhase.Dark => HideSeekPhase.Reveal,
                HideSeekPhase.Reveal => HideSeekPhase.Dark,
                _ => HideSeekPhase.Ended,
            };
            var durationSec = _phase == HideSeekPhase.Dark ? HideSeekConfig.DarkDurationSec : HideSeekConfig.RevealDurationSec;
            // Clamped to the game's fixed end so this can't schedule a phase
            // boundary past it — the last REVEAL and the game end coincide
            // by construction, and this keeps that true after a catch-up too.
            _phaseEndsAtUtc = Math.Min(_phaseEndsAtUtc + durationSec * 1000L, _gameEndsAtUtc);
        }
    }

    private void Move(HideSeekPlayerState player, double dtSeconds)
    {
        var axisX = (player.InputRight ? 1 : 0) - (player.InputLeft ? 1 : 0);
        var axisY = (player.InputDown ? 1 : 0) - (player.InputUp ? 1 : 0);
        if (axisX == 0 && axisY == 0) return;

        var length = Math.Sqrt(axisX * axisX + axisY * axisY);
        var speed = (player.Role == HideSeekRole.Seeker ? HideSeekConfig.PlayerSpeed * HideSeekConfig.SeekerSpeedMultiplier : HideSeekConfig.PlayerSpeed) * dtSeconds;
        var dx = axisX / length * speed;
        var dy = axisY / length * speed;

        // Axis-separated so a player sliding into a wall at an angle keeps
        // moving along the axis that's still clear, instead of stopping dead.
        if (dx != 0)
        {
            var nextX = player.X + dx;
            if (_map.IsWalkableWorld(nextX, player.Y, HideSeekConfig.PlayerRadius)) player.X = nextX;
        }
        if (dy != 0)
        {
            var nextY = player.Y + dy;
            if (_map.IsWalkableWorld(player.X, nextY, HideSeekConfig.PlayerRadius)) player.Y = nextY;
        }
    }
}
