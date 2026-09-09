using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Retrospective.Server.Rooms.HideSeek;

public sealed record HideSeekTilePoint(int X, int Y);

/// <summary>
/// Loads the one physical map file this game has — linked into the build
/// output from <c>games/hide-and-seek/src/data/maps/classic.json</c> (see
/// the .csproj's <c>Content Include</c>) rather than duplicated — and
/// exposes it in the shape the authoritative simulation and
/// <see cref="HideSeekVision"/> need.
///
/// A SHA-256 hash of the raw file bytes is computed once at load time.
/// <see cref="Hubs.RoomHub"/> sends that hash alongside the map data in
/// <c>GameStarted</c> so a client can tell its own bundled copy apart from
/// the server's — same physical file, so they should never disagree, but
/// "shouldn't" isn't "can't"; a mismatch means the client renders a
/// different wall layout than the one collisions and catches are actually
/// computed against, which must fail loudly rather than silently.
/// </summary>
public sealed class HideSeekMap
{
    public required string Id { get; init; }
    public required int Width { get; init; }
    public required int Height { get; init; }
    public required int TileSize { get; init; }
    /// <summary>tiles[y][x] — true means wall.</summary>
    public required bool[][] Tiles { get; init; }
    /// <summary>Same '0'/'1' row strings as the file, kept verbatim so the wire payload never has to reconstruct them from <see cref="Tiles"/>.</summary>
    public required IReadOnlyList<string> Rows { get; init; }
    public required HideSeekTilePoint SeekerSpawn { get; init; }
    public required IReadOnlyList<HideSeekTilePoint> HiderSpawns { get; init; }
    public required string MapHash { get; init; }
    /// <summary>The raw file bytes, verbatim — exactly what <c>GameStarted</c> sends to clients.</summary>
    public required string RawJson { get; init; }

    public bool IsWall(int x, int y) => x < 0 || y < 0 || x >= Width || y >= Height || Tiles[y][x];

    /// <summary>True if a circular player body of <paramref name="radius"/> centered at the given world point overlaps no wall tile — same four-probe check as the client's <c>isWalkable</c>.</summary>
    public bool IsWalkableWorld(double worldX, double worldY, double radius)
    {
        return !IsWallAtWorld(worldX - radius, worldY)
            && !IsWallAtWorld(worldX + radius, worldY)
            && !IsWallAtWorld(worldX, worldY - radius)
            && !IsWallAtWorld(worldX, worldY + radius);
    }

    private bool IsWallAtWorld(double worldX, double worldY) =>
        IsWall((int)Math.Floor(worldX / TileSize), (int)Math.Floor(worldY / TileSize));

    public (double X, double Y) TileCenterToWorld(HideSeekTilePoint tile) =>
        ((tile.X + 0.5) * TileSize, (tile.Y + 0.5) * TileSize);

    public (int X, int Y) WorldToTile(double worldX, double worldY) =>
        ((int)Math.Floor(worldX / TileSize), (int)Math.Floor(worldY / TileSize));

    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    public static HideSeekMap LoadClassic()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "Rooms", "HideSeek", "maps", "classic.json");
        var rawJson = File.ReadAllText(path);
        return Parse(rawJson);
    }

    /// <summary>Exposed separately from <see cref="LoadClassic"/> so tests (and the vision fixture generator) can parse a fixed string without touching disk.</summary>
    public static HideSeekMap Parse(string rawJson)
    {
        var file = JsonSerializer.Deserialize<MapFile>(rawJson, JsonOptions)
            ?? throw new InvalidOperationException("hide-and-seek map file is empty or malformed");
        if (file.Rows.Count != file.Height)
            throw new InvalidOperationException($"hide-and-seek map \"{file.Id}\": expected {file.Height} rows, got {file.Rows.Count}");

        var tiles = new bool[file.Height][];
        for (var y = 0; y < file.Height; y++)
        {
            var row = file.Rows[y];
            if (row.Length != file.Width)
                throw new InvalidOperationException($"hide-and-seek map \"{file.Id}\": row {y} has length {row.Length}, expected {file.Width}");
            tiles[y] = new bool[file.Width];
            for (var x = 0; x < file.Width; x++) tiles[y][x] = row[x] == '1';
        }

        var hashBytes = SHA256.HashData(Encoding.UTF8.GetBytes(rawJson));
        var mapHash = Convert.ToHexStringLower(hashBytes);

        return new HideSeekMap
        {
            Id = file.Id,
            Width = file.Width,
            Height = file.Height,
            TileSize = file.TileSize,
            Tiles = tiles,
            Rows = file.Rows,
            SeekerSpawn = file.SeekerSpawn,
            HiderSpawns = file.HiderSpawns,
            MapHash = mapHash,
            RawJson = rawJson,
        };
    }

    private sealed record MapFile(
        string Id,
        int Width,
        int Height,
        int TileSize,
        List<string> Rows,
        HideSeekTilePoint SeekerSpawn,
        List<HideSeekTilePoint> HiderSpawns);
}
