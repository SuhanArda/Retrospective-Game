using Retrospective.Server.Rooms;
using Retrospective.Server.Rooms.HideSeek;

namespace Retrospective.Server.Tests;

/// <summary>
/// A throwaway <see cref="HideSeekManager"/> for tests that construct a
/// <see cref="RoomManager"/> but exercise a different game entirely
/// (Imposter, Retro Rush, plain room lifecycle) — none of them ever start a
/// hide-and-seek round, so a tiny made-up map is enough to satisfy the
/// constructor. Saklambaç's own behavior is covered under
/// <c>HideSeek/</c> instead.
/// </summary>
internal static class HideSeekTestSupport
{
    private const string MinimalMapJson =
        """{"id":"test","width":3,"height":3,"tileSize":20,"rows":["111","101","111"],"seekerSpawn":{"x":1,"y":1},"hiderSpawns":[{"x":1,"y":1}]}""";

    public static HideSeekManager CreateManager() => new(HideSeekMap.Parse(MinimalMapJson), new ZeroRoomRandom(), TimeProvider.System);

    private sealed class ZeroRoomRandom : IRoomRandom
    {
        public int Next(int maximumExclusive) => 0;
        public int Next(int minimumInclusive, int maximumExclusive) => minimumInclusive;
    }
}
