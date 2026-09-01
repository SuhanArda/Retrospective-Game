using System.Collections.Concurrent;
using Retrospective.Server.Contracts;

namespace Retrospective.Server.Rooms.HideSeek;

/// <summary>
/// Saklambaç's own authority, deliberately separate from
/// <see cref="RoomManager"/>: it owns the 20Hz-simulated position/vision
/// state that must never ride through the group-broadcast
/// <c>RoomSnapshot</c>, and it's driven by its own
/// <see cref="HideSeekGameLoopService"/> tick loop rather than the
/// 10Hz <see cref="RoomMaintenanceService"/> every other game shares.
///
/// <see cref="RoomManager"/> depends on this class (constructor injection)
/// at a handful of existing lifecycle hooks — game start, leave, disconnect,
/// reconnect — the same points RetroRush and Imposter already hook into.
/// This class has no dependency back on <see cref="RoomManager"/> at all.
/// </summary>
public sealed class HideSeekManager(HideSeekMap map, IRoomRandom random, TimeProvider timeProvider)
{
    private readonly ConcurrentDictionary<string, HideSeekGame> _games = new(StringComparer.Ordinal);

    public HideSeekMap Map => map;

    public HideAndSeekMapPayload GetMapPayload() => new(map.Id, map.Width, map.Height, map.TileSize, map.Rows, map.MapHash);

    public HideAndSeekStateSnapshot StartGame(string roomCode, IReadOnlyList<(string PlayerId, string? ConnectionId)> roster)
    {
        var game = new HideSeekGame(roomCode, map, roster, random, timeProvider);
        _games[roomCode] = game;
        return game.GetPublicSnapshot();
    }

    public void EndGame(string roomCode) => _games.TryRemove(roomCode, out _);

    public void SetInput(string roomCode, string playerId, HideAndSeekInputRequest request)
    {
        if (_games.TryGetValue(roomCode, out var game)) game.SetInput(playerId, request);
    }

    public void SetConnected(string roomCode, string playerId, string? connectionId, bool connected)
    {
        if (_games.TryGetValue(roomCode, out var game)) game.SetConnected(playerId, connectionId, connected);
    }

    public void RemovePlayer(string roomCode, string playerId)
    {
        if (!_games.TryGetValue(roomCode, out var game)) return;
        game.RemovePlayer(playerId);
        if (!game.HasPlayers()) _games.TryRemove(roomCode, out _);
    }

    /// <summary>Snapshot of currently active games, for the loop service to tick — a copy, so ticking never blocks a concurrent start/end.</summary>
    public IReadOnlyList<HideSeekGame> ActiveGames => _games.Values.ToArray();
}
