using RetroPlatform.Api.Domain;

namespace RetroPlatform.Api.Tests;

public class VoteResolverTests
{
    private static readonly string[] Candidates = ["retro-rush", "pixel-arena", "sprint-maze"];

    /// <summary>Random that always returns the first option, so outcomes are assertable.</summary>
    private sealed class FirstChoice : Random
    {
        public override int Next(int maxValue) => 0;
    }

    private sealed class LastChoice : Random
    {
        public override int Next(int maxValue) => maxValue - 1;
    }

    [Fact]
    public void Picks_the_game_with_the_most_votes()
    {
        var votes = new Dictionary<string, string>
        {
            ["p1"] = "pixel-arena",
            ["p2"] = "pixel-arena",
            ["p3"] = "retro-rush",
        };

        var outcome = VoteResolver.Resolve(votes, Candidates, new FirstChoice());

        Assert.Equal("pixel-arena", outcome!.Winner);
        Assert.Equal(["pixel-arena"], outcome.TiedCandidates);
    }

    [Fact]
    public void Breaks_a_draw_between_only_the_tied_games()
    {
        var votes = new Dictionary<string, string>
        {
            ["p1"] = "retro-rush",
            ["p2"] = "sprint-maze",
        };

        var outcome = VoteResolver.Resolve(votes, Candidates, new LastChoice());

        // pixel-arena got no votes, so it must not be in the draw.
        Assert.Equal(["retro-rush", "sprint-maze"], outcome!.TiedCandidates);
        Assert.Equal("sprint-maze", outcome.Winner);
    }

    [Fact]
    public void Falls_back_to_a_random_game_when_nobody_voted()
    {
        var outcome = VoteResolver.Resolve(new Dictionary<string, string>(), Candidates, new FirstChoice());

        Assert.Equal(Candidates, outcome!.TiedCandidates);
        Assert.Equal("retro-rush", outcome.Winner);
    }

    [Fact]
    public void Ignores_votes_for_games_that_are_no_longer_offered()
    {
        var votes = new Dictionary<string, string> { ["p1"] = "deleted-game", ["p2"] = "retro-rush" };

        var outcome = VoteResolver.Resolve(votes, Candidates, new FirstChoice());

        Assert.Equal("retro-rush", outcome!.Winner);
    }

    [Fact]
    public void Returns_null_when_there_is_nothing_to_choose_from()
    {
        Assert.Null(VoteResolver.Resolve(null, [], new FirstChoice()));
    }
}
