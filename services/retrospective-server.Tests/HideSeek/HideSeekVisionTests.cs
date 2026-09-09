using Retrospective.Server.Rooms.HideSeek;
using Xunit;

namespace Retrospective.Server.Tests.HideSeek;

public sealed class HideSeekVisionTests
{
    private static HideSeekMap BuildMap(string[] rows) => HideSeekMap.Parse(
        $$"""{"id":"test","width":{{rows[0].Length}},"height":{{rows.Length}},"tileSize":20,"rows":{{System.Text.Json.JsonSerializer.Serialize(rows)}},"seekerSpawn":{"x":0,"y":0},"hiderSpawns":[{"x":0,"y":0}]}""");

    [Fact]
    public void SeesEveryTileWithinRadiusInAnOpenRoom()
    {
        var map = BuildMap([
            "000000000",
            "000000000",
            "000000000",
            "000000000",
            "000000000",
            "000000000",
            "000000000",
            "000000000",
            "000000000",
        ]);
        var visible = HideSeekVision.ComputeVisibleTiles(map, 4, 4, 3);
        Assert.Contains((4, 4), visible);
        Assert.Contains((4, 7), visible);
        Assert.Contains((7, 4), visible);
        Assert.DoesNotContain((4, 8), visible);
        Assert.DoesNotContain((8, 4), visible);
    }

    [Fact]
    public void DoesNotSeePastAWallDirectlyInTheLineOfSight()
    {
        var map = BuildMap([
            "000000000",
            "000000000",
            "000000000",
            "000000000",
            "000010000",
            "000000000",
            "000000000",
            "000000000",
            "000000000",
        ]);
        var visible = HideSeekVision.ComputeVisibleTiles(map, 2, 4, 5);
        Assert.Contains((3, 4), visible);
        Assert.Contains((4, 4), visible);
        Assert.DoesNotContain((5, 4), visible);
        Assert.DoesNotContain((6, 4), visible);
    }

    [Fact]
    public void DoesNotSeeIntoAClosedOffInnerRoom()
    {
        var map = BuildMap([
            "111111111",
            "100000001",
            "101111101",
            "101000101",
            "101000101",
            "101000101",
            "101111101",
            "100000001",
            "111111111",
        ]);
        var visible = HideSeekVision.ComputeVisibleTiles(map, 1, 1, 8);
        Assert.DoesNotContain((4, 4), visible);
        Assert.DoesNotContain((3, 3), visible);
    }

    [Fact]
    public void IsSymmetricInAnOpenRoom()
    {
        var map = BuildMap([
            "00000",
            "00000",
            "01000",
            "00000",
            "00000",
        ]);
        var fromCorner = HideSeekVision.ComputeVisibleTiles(map, 0, 0, 6);
        var fromOpposite = HideSeekVision.ComputeVisibleTiles(map, 4, 4, 6);
        Assert.Equal(fromOpposite.Contains((0, 0)), fromCorner.Contains((4, 4)));
    }

    [Fact]
    public void BresenhamLineIncludesBothEndpoints()
    {
        var line = HideSeekVision.BresenhamLine(0, 0, 3, 0);
        Assert.Equal((0, 0), line[0]);
        Assert.Equal((3, 0), line[^1]);
    }

    [Fact]
    public void IsPlayerVisibleFalseBeyondRadiusEvenWithClearLine()
    {
        var map = BuildMap(["00000", "00100", "00000"]);
        Assert.False(HideSeekVision.IsPlayerVisible(map, 0, 0, 4, 0, 2));
    }

    [Fact]
    public void IsPlayerVisibleTrueWithinRadiusAndClearLine()
    {
        var map = BuildMap(["00000", "00100", "00000"]);
        Assert.True(HideSeekVision.IsPlayerVisible(map, 0, 0, 2, 0, 4));
    }

    [Fact]
    public void IsPlayerVisibleFalseWhenWallBlocksTheLine()
    {
        var map = BuildMap(["00000", "00100", "00000"]);
        Assert.False(HideSeekVision.IsPlayerVisible(map, 0, 1, 4, 1, 4));
    }
}
