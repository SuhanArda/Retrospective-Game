using Microsoft.Extensions.Time.Testing;
using RetroPlatform.Api.Rooms;

namespace RetroPlatform.Api.Tests;

public class ReactionPolicyTests
{
    private const string Player = "player-1";

    private static (ReactionPolicy Policy, FakeTimeProvider Time) NewPolicy()
    {
        var time = new FakeTimeProvider(DateTimeOffset.UnixEpoch.AddDays(1));
        return (new ReactionPolicy(time), time);
    }

    [Fact]
    public void Every_offered_emoji_is_accepted()
    {
        Assert.All(ReactionPolicy.AllowedEmoji, emoji => Assert.True(ReactionPolicy.IsAllowed(emoji)));
    }

    [Theory]
    [InlineData("hello")]
    [InlineData("<script>alert(1)</script>")]
    [InlineData("🦄")]
    [InlineData("")]
    // U+2764 without the U+FE0F that makes the offered "❤️": close is not equal.
    [InlineData("❤")]
    public void Anything_outside_the_set_is_refused(string emoji)
    {
        Assert.False(ReactionPolicy.IsAllowed(emoji));
    }

    [Fact]
    public void A_player_may_send_up_to_the_limit_and_no_further()
    {
        var (policy, _) = NewPolicy();

        for (var i = 0; i < ReactionPolicy.MaxPerWindow; i++) Assert.True(policy.TryRecord(Player));

        Assert.False(policy.TryRecord(Player));
    }

    [Fact]
    public void The_budget_returns_once_the_window_has_passed()
    {
        var (policy, time) = NewPolicy();
        for (var i = 0; i < ReactionPolicy.MaxPerWindow; i++) policy.TryRecord(Player);

        time.Advance(ReactionPolicy.Window);

        Assert.True(policy.TryRecord(Player));
    }

    [Fact]
    public void The_window_slides_rather_than_resetting_on_a_schedule()
    {
        var (policy, time) = NewPolicy();
        for (var i = 0; i < ReactionPolicy.MaxPerWindow; i++) policy.TryRecord(Player);

        // Half a window on, every send is still inside it.
        time.Advance(ReactionPolicy.Window / 2);

        Assert.False(policy.TryRecord(Player));
    }

    [Fact]
    public void One_players_spam_does_not_spend_anyone_elses_budget()
    {
        var (policy, _) = NewPolicy();
        for (var i = 0; i < ReactionPolicy.MaxPerWindow; i++) policy.TryRecord(Player);

        Assert.True(policy.TryRecord("player-2"));
    }

    [Fact]
    public void Forgetting_a_player_clears_what_they_had_spent()
    {
        var (policy, _) = NewPolicy();
        for (var i = 0; i < ReactionPolicy.MaxPerWindow; i++) policy.TryRecord(Player);

        policy.Forget(Player);

        Assert.True(policy.TryRecord(Player));
    }
}
