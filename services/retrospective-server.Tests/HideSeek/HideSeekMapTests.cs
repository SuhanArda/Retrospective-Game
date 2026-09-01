using System.Linq;
using Retrospective.Server.Rooms.HideSeek;
using Xunit;

namespace Retrospective.Server.Tests.HideSeek;

/// <summary>
/// Invariants over the bundled <c>classic.json</c> itself, not the
/// shadowcasting math (that's <see cref="HideSeekVisionTests"/>) — the kind
/// of thing that stays true by luck until someone bumps a config number and
/// nobody notices the map didn't keep up.
/// </summary>
public sealed class HideSeekMapTests
{
    [Fact]
    public void HasEnoughHiderSpawnsForTheMaximumRoomSize()
    {
        var map = HideSeekMap.LoadClassic();
        // MaxPlayers includes the seeker, so this many hiders each need a
        // distinct spawn tile — a shortfall means HideSeekGame cycles the
        // spawn list and stacks two hiders on the exact same tile at game
        // start (the bug this test guards against).
        Assert.True(
            map.HiderSpawns.Count >= HideSeekConfig.MaxPlayers - 1,
            $"classic.json only has {map.HiderSpawns.Count} hider spawns, needs at least {HideSeekConfig.MaxPlayers - 1} for MaxPlayers={HideSeekConfig.MaxPlayers}");
    }

    [Fact]
    public void HasNoDuplicateHiderSpawnTiles()
    {
        var map = HideSeekMap.LoadClassic();
        var distinctTiles = map.HiderSpawns.Select(spawn => (spawn.X, spawn.Y)).Distinct().Count();
        Assert.Equal(map.HiderSpawns.Count, distinctTiles);
    }

    [Fact]
    public void EverySpawnSitsOnAFloorTile()
    {
        var map = HideSeekMap.LoadClassic();
        foreach (var spawn in map.HiderSpawns.Append(map.SeekerSpawn))
        {
            Assert.False(map.IsWall(spawn.X, spawn.Y), $"({spawn.X},{spawn.Y}) is a wall tile");
        }
    }
}
