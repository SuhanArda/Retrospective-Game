using System.Security.Cryptography;

namespace Retrospective.Server.Rooms;

public interface IRoomRandom
{
    int Next(int maximumExclusive);
    int Next(int minimumInclusive, int maximumExclusive);
}

public sealed class CryptographicRoomRandom : IRoomRandom
{
    public int Next(int maximumExclusive) => RandomNumberGenerator.GetInt32(maximumExclusive);
    public int Next(int minimumInclusive, int maximumExclusive) =>
        RandomNumberGenerator.GetInt32(minimumInclusive, maximumExclusive);
}
