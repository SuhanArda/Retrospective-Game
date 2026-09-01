using Microsoft.Extensions.Options;
using Retrospective.Server.Contracts;
using Retrospective.Server.Rooms;
using Retrospective.Server.Rooms.HideSeek;
using Xunit;

namespace Retrospective.Server.Tests.HideSeek;

/// <summary>
/// Covers the handful of lines <see cref="RoomManager"/> actually gained for
/// Saklambaç (vote-in, start, leave/disconnect propagation, reset on return
/// to lobby) — not the simulation itself, which <see cref="HideSeekGameTests"/>
/// and <see cref="HideSeekVisionTests"/> already cover. Uses a real
/// <see cref="HideSeekManager"/> (not <see cref="HideSeekTestSupport"/>'s
/// throwaway one) so <see cref="HideSeekManager.ActiveGames"/> can be
/// inspected directly.
/// </summary>
public sealed class HideSeekRoomManagerTests
{
    private const string MapJson =
        """{"id":"test","width":5,"height":5,"tileSize":20,"rows":["11111","10001","10001","10001","11111"],"seekerSpawn":{"x":1,"y":1},"hiderSpawns":[{"x":3,"y":3},{"x":3,"y":1},{"x":1,"y":3}]}""";

    private static (RoomManager Manager, HideSeekManager HideSeek) CreateManager()
    {
        var hideSeek = new HideSeekManager(HideSeekMap.Parse(MapJson), new FixedRoomRandom(), TimeProvider.System);
        var manager = new RoomManager(
            TimeProvider.System,
            Options.Create(new RoomOptions { DisconnectGraceSeconds = 25, QuestionLoadingMilliseconds = 1800 }),
            new FixedRoomRandom(),
            hideSeek);
        return (manager, hideSeek);
    }

    private static string AttachThreePlayersAndReturnHostConnectionId(RoomManager manager, out string[] connectionIds)
    {
        var host = manager.Create(new CreateRoomRequest("Ada", "#654321", "Oda", 10, 30, 30));
        var guestA = manager.Join(host.RoomCode, new JoinRoomRequest("Mert", "#123456"));
        var guestB = manager.Join(host.RoomCode, new JoinRoomRequest("Ece", "#abcdef"));
        manager.Attach(host.RoomCode, host.PlayerId, host.ReconnectToken, "host-conn");
        manager.Attach(host.RoomCode, guestA.PlayerId, guestA.ReconnectToken, "guestA-conn");
        manager.Attach(host.RoomCode, guestB.PlayerId, guestB.ReconnectToken, "guestB-conn");
        connectionIds = ["host-conn", "guestA-conn", "guestB-conn"];
        return "host-conn";
    }

    [Fact]
    public void ResolvingAVoteForHideAndSeekStartsExactlyOneAuthoritativeGame()
    {
        var (manager, hideSeek) = CreateManager();
        var hostConnection = AttachThreePlayersAndReturnHostConnectionId(manager, out _);

        manager.BeginGameSelection(hostConnection, ["hide-and-seek"]);
        var resolution = manager.ResolveVote(hostConnection);

        Assert.True(resolution.GameStarted);
        Assert.Equal("hide-and-seek", resolution.Snapshot.CurrentGameSession?.GameId);
        Assert.NotNull(resolution.Snapshot.HideAndSeekState);
        Assert.Single(hideSeek.ActiveGames);
        // The seeker really is one of the three room players, not a stray id.
        Assert.Contains(resolution.Snapshot.Players, player => player.Id == resolution.Snapshot.HideAndSeekState!.SeekerPlayerId);
    }

    [Fact]
    public void HideAndSeekIsExcludedFromCandidatesWithFewerThanThreePlayers()
    {
        var (manager, _) = CreateManager();
        var host = manager.Create(new CreateRoomRequest("Ada", "#654321", "Oda", 10, 30, 30));
        manager.Attach(host.RoomCode, host.PlayerId, host.ReconnectToken, "host-conn");

        var selection = manager.BeginGameSelection("host-conn", ["hide-and-seek", "retro-rush"]);

        Assert.DoesNotContain("hide-and-seek", selection.CandidateGameIds);
        Assert.Contains("retro-rush", selection.CandidateGameIds);
    }

    [Fact]
    public void ReturningToLobbyEndsTheActiveHideAndSeekGame()
    {
        var (manager, hideSeek) = CreateManager();
        var hostConnection = AttachThreePlayersAndReturnHostConnectionId(manager, out _);
        manager.BeginGameSelection(hostConnection, ["hide-and-seek"]);
        manager.ResolveVote(hostConnection);
        Assert.Single(hideSeek.ActiveGames);

        var snapshot = manager.ReturnToLobby(hostConnection);

        Assert.Empty(hideSeek.ActiveGames);
        Assert.Null(snapshot.HideAndSeekState);
    }

    [Fact]
    public void LeavingARoomRemovesThatPlayerFromTheActiveHideAndSeekGame()
    {
        var (manager, hideSeek) = CreateManager();
        var hostConnection = AttachThreePlayersAndReturnHostConnectionId(manager, out var connectionIds);
        manager.BeginGameSelection(hostConnection, ["hide-and-seek"]);
        manager.ResolveVote(hostConnection);
        var game = hideSeek.ActiveGames.Single();
        Assert.Equal(3, game.Tick(0).Players.Count);

        manager.Leave(connectionIds[1]); // guestA leaves

        Assert.Equal(2, game.Tick(0).Players.Count);
    }

    private sealed class FixedRoomRandom : IRoomRandom
    {
        public int Next(int maximumExclusive) => 0;
        public int Next(int minimumInclusive, int maximumExclusive) => minimumInclusive;
    }
}
