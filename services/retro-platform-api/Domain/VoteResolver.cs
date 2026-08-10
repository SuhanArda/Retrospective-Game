namespace RetroPlatform.Api.Domain;

public sealed record VoteOutcome(string Winner, IReadOnlyList<string> TiedCandidates);

/// <summary>
/// Decides which game a room plays. Mirrors <c>domain/voting.ts</c> on the web
/// side, but this is the copy that counts: the browser's version only drives
/// the preview, the server owns the real result.
/// </summary>
public static class VoteResolver
{
    public static IReadOnlyDictionary<string, int> Tally(IReadOnlyDictionary<string, string>? votes)
    {
        var tally = new Dictionary<string, int>();
        if (votes is null) return tally;
        foreach (var gameId in votes.Values)
        {
            tally[gameId] = tally.GetValueOrDefault(gameId) + 1;
        }
        return tally;
    }

    /// <summary>
    /// Highest vote count wins. A draw is broken at random between the tied
    /// games, and a round where nobody voted falls back to a random pick so a
    /// room can never get stuck waiting for a decision.
    /// </summary>
    public static VoteOutcome? Resolve(
        IReadOnlyDictionary<string, string>? votes,
        IReadOnlyList<string> candidateIds,
        Random random)
    {
        if (candidateIds.Count == 0) return null;

        var tally = Tally(votes);
        // Votes for games that are no longer on offer are ignored.
        var voted = candidateIds.Where(id => tally.GetValueOrDefault(id) > 0).ToList();

        var tied = voted.Count > 0
            ? voted.Where(id => tally[id] == voted.Max(x => tally[x])).ToList()
            : candidateIds.ToList();

        return new VoteOutcome(tied[random.Next(tied.Count)], tied);
    }
}
