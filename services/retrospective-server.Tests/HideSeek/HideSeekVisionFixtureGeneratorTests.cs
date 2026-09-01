using System.Text.Json;
using Retrospective.Server.Rooms.HideSeek;
using Xunit;

namespace Retrospective.Server.Tests.HideSeek;

/// <summary>
/// Not a correctness test on its own — <see cref="HideSeekVisionTests"/>
/// covers that. This regenerates the cross-language parity fixture every
/// time the suite runs, from the real <c>classic.json</c> map and the
/// current C# <see cref="HideSeekVision"/>, so the fixture can never fall
/// out of sync with the algorithm that produced it. A fixed seed keeps the
/// output reproducible (no test-to-test diff noise) while still covering
/// hundreds of scenarios instead of a handful of hand-picked ones.
///
/// <c>games/hide-and-seek/src/domain/vision.parity.test.ts</c> reads this
/// same physical file and asserts its own <c>vision.ts</c> reproduces every
/// value here exactly.
/// </summary>
public sealed class HideSeekVisionFixtureGeneratorTests
{
    private const int ScenarioCount = 300;
    private const int Seed = 20260828;

    [Fact]
    public void RegeneratesTheVisionParityFixtureFromTheRealMap()
    {
        var map = HideSeekMap.LoadClassic();
        var random = new Random(Seed);

        var tileCases = new List<object>();
        for (var i = 0; i < ScenarioCount; i++)
        {
            var originX = random.Next(map.Width);
            var originY = random.Next(map.Height);
            var radius = random.Next(1, 8);
            var visible = HideSeekVision.ComputeVisibleTiles(map, originX, originY, radius)
                .OrderBy(tile => tile.X).ThenBy(tile => tile.Y)
                .Select(tile => new[] { tile.X, tile.Y })
                .ToArray();
            tileCases.Add(new { originX, originY, radius, visible });
        }

        var playerCases = new List<object>();
        for (var i = 0; i < ScenarioCount; i++)
        {
            var observerX = random.Next(map.Width);
            var observerY = random.Next(map.Height);
            var targetX = random.Next(map.Width);
            var targetY = random.Next(map.Height);
            var radius = random.Next(1, 8);
            var visible = HideSeekVision.IsPlayerVisible(map, observerX, observerY, targetX, targetY, radius);
            playerCases.Add(new { observerX, observerY, targetX, targetY, radius, visible });
        }

        var fixture = new
        {
            mapId = map.Id,
            mapWidth = map.Width,
            mapHeight = map.Height,
            mapHash = map.MapHash,
            seed = Seed,
            tileVisibility = tileCases,
            playerVisibility = playerCases,
        };

        // Compact, not indented — this fixture is meant to be read by code, not
        // eyeballed, and 300 scenarios' worth of visible-tile lists get large fast.
        var json = JsonSerializer.Serialize(fixture);
        var outputPath = FindFixturePath();
        File.WriteAllText(outputPath, json + "\n");

        Assert.True(File.Exists(outputPath));
    }

    private static string FindFixturePath()
    {
        var current = new DirectoryInfo(AppContext.BaseDirectory);
        while (current is not null && !Directory.Exists(Path.Combine(current.FullName, ".git")))
        {
            current = current.Parent;
        }
        if (current is null)
        {
            throw new InvalidOperationException("could not locate the repo root (no .git ancestor) from the test output directory");
        }

        var fixtureDir = Path.Combine(current.FullName, "packages", "platform-contracts", "test-fixtures");
        Directory.CreateDirectory(fixtureDir);
        return Path.Combine(fixtureDir, "hide-seek-vision-cases.json");
    }
}
