namespace Retrospective.Server.Rooms.HideSeek;

/// <summary>
/// C# port of <c>games/hide-and-seek/src/domain/vision.ts</c> — grid-based
/// recursive shadowcasting (symmetric, eight octants) for tile fog, plus a
/// separate Bresenham line check for player-to-player visibility. This is
/// the authoritative half: <see cref="HideSeekManager"/> uses it to decide
/// which players' positions go into which connection's snapshot. The two
/// implementations must behave identically — the parity fixture test
/// (<c>HideSeekVisionFixtureGenerator</c> / <c>vision.parity.test.ts</c>)
/// compares them tile-for-tile and player-pair-for-player-pair. Do not
/// "simplify" the math here without regenerating that fixture.
/// </summary>
public static class HideSeekVision
{
    private static readonly (int Xx, int Xy, int Yx, int Yy)[] OctantTransforms =
    [
        (1, 0, 0, 1),
        (0, 1, 1, 0),
        (0, -1, 1, 0),
        (-1, 0, 0, 1),
        (-1, 0, 0, -1),
        (0, -1, -1, 0),
        (0, 1, -1, 0),
        (1, 0, 0, -1),
    ];

    /// <summary>
    /// Every tile within <paramref name="radiusTiles"/> of (originX, originY)
    /// that isn't behind a wall (always includes the origin tile itself).
    /// </summary>
    public static HashSet<(int X, int Y)> ComputeVisibleTiles(HideSeekMap map, int originX, int originY, int radiusTiles)
    {
        var visible = new HashSet<(int X, int Y)>();
        void Mark(int x, int y)
        {
            if (x < 0 || y < 0 || x >= map.Width || y >= map.Height) return;
            visible.Add((x, y));
        }
        Mark(originX, originY);
        foreach (var (xx, xy, yx, yy) in OctantTransforms)
        {
            CastLight(map, originX, originY, 1, 1.0, 0.0, radiusTiles, xx, xy, yx, yy, Mark);
        }
        return visible;
    }

    private static void CastLight(
        HideSeekMap map,
        int originX,
        int originY,
        int row,
        double startSlope,
        double endSlope,
        int radius,
        int xx,
        int xy,
        int yx,
        int yy,
        Action<int, int> onVisible)
    {
        if (startSlope < endSlope) return;

        var nextStartSlope = startSlope;
        for (var distance = row; distance <= radius; distance++)
        {
            var dx = -distance - 1;
            var dy = -distance;
            var blocked = false;
            var newStart = 0.0;

            while (dx <= 0)
            {
                dx += 1;
                var mapX = originX + dx * xx + dy * xy;
                var mapY = originY + dx * yx + dy * yy;
                var leftSlope = (dx - 0.5) / (dy + 0.5);
                var rightSlope = (dx + 0.5) / (dy - 0.5);

                if (nextStartSlope < rightSlope) continue;
                if (endSlope > leftSlope) break;

                if (dx * dx + dy * dy <= radius * radius) onVisible(mapX, mapY);

                if (blocked)
                {
                    if (map.IsWall(mapX, mapY))
                    {
                        newStart = rightSlope;
                        continue;
                    }
                    blocked = false;
                    nextStartSlope = newStart;
                }
                else if (map.IsWall(mapX, mapY) && distance < radius)
                {
                    blocked = true;
                    CastLight(map, originX, originY, distance + 1, nextStartSlope, leftSlope, radius, xx, xy, yx, yy, onVisible);
                    newStart = rightSlope;
                }
            }

            if (blocked) break;
        }
    }

    /// <summary>Bresenham's line algorithm between two tile centers, both endpoints included.</summary>
    public static List<(int X, int Y)> BresenhamLine(int fromX, int fromY, int toX, int toY)
    {
        var points = new List<(int X, int Y)>();
        var x0 = fromX;
        var y0 = fromY;
        var dx = Math.Abs(toX - x0);
        var dy = -Math.Abs(toY - y0);
        var sx = x0 < toX ? 1 : -1;
        var sy = y0 < toY ? 1 : -1;
        var err = dx + dy;
        while (true)
        {
            points.Add((x0, y0));
            if (x0 == toX && y0 == toY) break;
            var doubledErr = 2 * err;
            if (doubledErr >= dy) { err += dy; x0 += sx; }
            if (doubledErr <= dx) { err += dx; y0 += sy; }
        }
        return points;
    }

    /// <summary>True if no tile strictly between the two endpoints (both excluded) is a wall.</summary>
    public static bool HasClearLineOfSight(HideSeekMap map, int fromX, int fromY, int toX, int toY)
    {
        var line = BresenhamLine(fromX, fromY, toX, toY);
        for (var index = 1; index < line.Count - 1; index++)
        {
            var (x, y) = line[index];
            if (map.IsWall(x, y)) return false;
        }
        return true;
    }

    /// <summary>
    /// Whether a target tile is visible to an observer: within
    /// <paramref name="radiusTiles"/> (Euclidean, tile units) AND an
    /// unobstructed straight line between the two tile centers. Deliberately
    /// not the same code path as <see cref="ComputeVisibleTiles"/>.
    /// </summary>
    public static bool IsPlayerVisible(HideSeekMap map, int observerX, int observerY, int targetX, int targetY, int radiusTiles)
    {
        var dx = targetX - observerX;
        var dy = targetY - observerY;
        if (Math.Sqrt(dx * dx + dy * dy) > radiusTiles) return false;
        return HasClearLineOfSight(map, observerX, observerY, targetX, targetY);
    }
}
