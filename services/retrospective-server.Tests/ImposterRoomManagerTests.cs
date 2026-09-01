using Microsoft.Extensions.Options;
using Retrospective.Server.Contracts;
using Retrospective.Server.Rooms;

namespace Retrospective.Server.Tests;

public sealed class ImposterRoomManagerTests
{
    [Fact]
    public void DemoCatalogContainsThirtyUniqueWordQuestionPairs()
    {
        Assert.Equal(30, ImposterDemoCatalog.Words.Count);
        Assert.Equal(30, ImposterDemoCatalog.Words.Select(item => item.SecretWord).Distinct(StringComparer.OrdinalIgnoreCase).Count());
        Assert.All(ImposterDemoCatalog.Words, item =>
        {
            Assert.False(string.IsNullOrWhiteSpace(item.Category));
            Assert.False(string.IsNullOrWhiteSpace(item.SecretWord));
            Assert.False(string.IsNullOrWhiteSpace(item.RetroQuestion));
        });
        Assert.Equal("Bu sprintte ne daha iyi yapılabilirdi?", ImposterDemoCatalog.Words[0].RetroQuestion);
    }

    [Fact]
    public void ImposterIsExcludedWhenRoomHasFewerThanThreePlayers()
    {
        var manager = new RoomManager(
            TimeProvider.System,
            Options.Create(new RoomOptions { DisconnectGraceSeconds = 25, QuestionLoadingMilliseconds = 1800 }),
            new FixedRoomRandom(),
            HideSeekTestSupport.CreateManager());
        var host = manager.Create(new CreateRoomRequest("Yağmur", "#654321", "Küçük Oda", 10, 30, 30));
        manager.Attach(host.RoomCode, host.PlayerId, host.ReconnectToken, "host");

        var selection = manager.BeginGameSelection("host", ["imposter", "retro-rush"]);

        Assert.DoesNotContain("imposter", selection.CandidateGameIds);
        Assert.Contains("retro-rush", selection.CandidateGameIds);
    }

    [Fact]
    public void SessionUsesRealRoomPlayersAndKeepsSecretAwayFromImposter()
    {
        var game = CreateStartedGame();

        var hostView = game.Manager.GetImposterSnapshot("host", game.SessionId);
        var firstGuestView = game.Manager.GetImposterSnapshot("guest-1", game.SessionId);

        Assert.Equal(["Yağmur", "Ali", "Ece"], hostView.Players.Select(player => player.DisplayName));
        Assert.Equal([0, 1, 2], hostView.Players.Select(player => player.AvatarIndex));
        Assert.Equal("IMPOSTER", hostView.YourRole);
        Assert.Null(hostView.SecretWord);
        Assert.Null(hostView.RetroQuestion);
        Assert.Equal("CREW", firstGuestView.YourRole);
        Assert.Equal("Sprint", firstGuestView.SecretWord);
    }

    [Fact]
    public void CharacterAssignmentsAndClueOrderAreRandomizedIndependently()
    {
        var game = CreateStartedGame(new SequenceRoomRandom(0, 0, 0, 7, 3, 7, 2, 1));

        var hostView = game.Manager.GetImposterSnapshot("host", game.SessionId);
        var guestView = game.Manager.GetImposterSnapshot("guest-1", game.SessionId);
        Assert.Equal([7, 4, 9], hostView.Players.Select(player => player.AvatarIndex));
        Assert.Equal(
            hostView.Players.Select(player => (player.PlayerId, player.AvatarIndex)),
            guestView.Players.Select(player => (player.PlayerId, player.AvatarIndex)));
        Assert.Equal(3, hostView.Players.Select(player => player.AvatarIndex).Distinct().Count());

        game.Manager.ReadyImposterRole("host", game.SessionId);
        game.Manager.ReadyImposterRole("guest-1", game.SessionId);
        game.Manager.ReadyImposterRole("guest-2", game.SessionId);

        Assert.Equal(game.SecondGuestId,
            game.Manager.GetImposterSnapshot("host", game.SessionId).CurrentSpeakerPlayerId);
        game.Manager.CompleteImposterClue("guest-2", game.SessionId);
        Assert.Equal(game.HostId,
            game.Manager.GetImposterSnapshot("guest-1", game.SessionId).CurrentSpeakerPlayerId);
        game.Manager.CompleteImposterClue("host", game.SessionId);
        Assert.Equal(game.FirstGuestId,
            game.Manager.GetImposterSnapshot("guest-2", game.SessionId).CurrentSpeakerPlayerId);
        game.Manager.CompleteImposterClue("guest-1", game.SessionId);

        Assert.Equal("VOTING", game.Manager.GetImposterSnapshot("host", game.SessionId).Phase);
    }

    [Fact]
    public void ReadyAndClueTurnsAreServerAuthoritative()
    {
        var game = CreateStartedGame();

        game.Manager.ReadyImposterRole("host", game.SessionId);
        game.Manager.ReadyImposterRole("guest-1", game.SessionId);
        Assert.Equal("ROLE_REVEAL", game.Manager.GetImposterSnapshot("host", game.SessionId).Phase);
        var clueRound = game.Manager.ReadyImposterRole("guest-2", game.SessionId);
        Assert.Equal(4, clueRound.Event.Revision);
        Assert.Equal("CLUE_GIVING", game.Manager.GetImposterSnapshot("host", game.SessionId).Phase);

        var rejection = Assert.Throws<RoomException>(() => game.Manager.CompleteImposterClue("guest-1", game.SessionId));
        Assert.Equal("NOT_CURRENT_SPEAKER", rejection.Code);
        game.Manager.CompleteImposterClue("host", game.SessionId);
        game.Manager.CompleteImposterClue("guest-1", game.SessionId);
        game.Manager.CompleteImposterClue("guest-2", game.SessionId);

        var voting = game.Manager.GetImposterSnapshot("host", game.SessionId);
        Assert.Equal("VOTING", voting.Phase);
        Assert.All(voting.Players, player => Assert.True(player.HasGivenClue));
    }

    [Fact]
    public void VotesStaySecretAndAllPlayersReceiveOneSharedResult()
    {
        var game = CreateVotingGame();

        game.Manager.CastImposterVote("host", new CastImposterVoteRequest(game.SessionId, game.FirstGuestId));
        game.Manager.CastImposterVote("guest-1", new CastImposterVoteRequest(game.SessionId, game.HostId));
        var waiting = game.Manager.GetImposterSnapshot("guest-1", game.SessionId);
        Assert.True(waiting.HasVoted);
        Assert.Null(waiting.Result);

        game.Manager.CastImposterVote("guest-2", new CastImposterVoteRequest(game.SessionId, game.HostId));
        var hostResult = game.Manager.GetImposterSnapshot("host", game.SessionId);
        var guestResult = game.Manager.GetImposterSnapshot("guest-2", game.SessionId);

        Assert.Equal("RESULTS", hostResult.Phase);
        Assert.Equal(hostResult.Result!.ImposterPlayerId, guestResult.Result!.ImposterPlayerId);
        Assert.Equal(hostResult.Result.SuspectedPlayerIds, guestResult.Result.SuspectedPlayerIds);
        Assert.Equal(hostResult.Result.ImposterCaught, guestResult.Result.ImposterCaught);
        Assert.True(hostResult.Result!.ImposterCaught);
        Assert.Equal([game.HostId], hostResult.Result.SuspectedPlayerIds);
        Assert.Equal("Sprint", hostResult.SecretWord);
        Assert.Equal("Bu sprintte ne daha iyi yapılabilirdi?", hostResult.RetroQuestion);
    }

    [Fact]
    public void OnlyHostStartsANewRoundWithANewWord()
    {
        var game = CreateVotingGame();
        game.Manager.CastImposterVote("host", new CastImposterVoteRequest(game.SessionId, game.FirstGuestId));
        game.Manager.CastImposterVote("guest-1", new CastImposterVoteRequest(game.SessionId, game.HostId));
        game.Manager.CastImposterVote("guest-2", new CastImposterVoteRequest(game.SessionId, game.HostId));

        var rejection = Assert.Throws<RoomException>(() => game.Manager.StartNextImposterRound("guest-1", game.SessionId));
        Assert.Equal("HOST_REQUIRED", rejection.Code);
        game.Manager.StartNextImposterRound("host", game.SessionId);
        var nextRound = game.Manager.GetImposterSnapshot("guest-1", game.SessionId);

        Assert.Equal(2, nextRound.RoundNumber);
        Assert.Equal("ROLE_REVEAL", nextRound.Phase);
        Assert.Equal("Backlog", nextRound.SecretWord);
        Assert.All(nextRound.Players, player => Assert.False(player.HasRevealedRole));
    }

    [Fact]
    public void NextRoundKeepsCharactersAndDrawsNewClueOrder()
    {
        var game = CreateStartedGame(new SequenceRoomRandom(
            0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 2, 1));
        var firstRoundAvatars = game.Manager.GetImposterSnapshot("host", game.SessionId)
            .Players.ToDictionary(player => player.PlayerId, player => player.AvatarIndex);
        game.Manager.ReadyImposterRole("host", game.SessionId);
        game.Manager.ReadyImposterRole("guest-1", game.SessionId);
        game.Manager.ReadyImposterRole("guest-2", game.SessionId);
        game.Manager.CompleteImposterClue("host", game.SessionId);
        game.Manager.CompleteImposterClue("guest-1", game.SessionId);
        game.Manager.CompleteImposterClue("guest-2", game.SessionId);
        game.Manager.CastImposterVote("host", new CastImposterVoteRequest(game.SessionId, game.FirstGuestId));
        game.Manager.CastImposterVote("guest-1", new CastImposterVoteRequest(game.SessionId, game.HostId));
        game.Manager.CastImposterVote("guest-2", new CastImposterVoteRequest(game.SessionId, game.HostId));

        game.Manager.StartNextImposterRound("host", game.SessionId);
        var nextRound = game.Manager.GetImposterSnapshot("host", game.SessionId);
        Assert.Equal(
            firstRoundAvatars,
            nextRound.Players.ToDictionary(player => player.PlayerId, player => player.AvatarIndex));

        game.Manager.ReadyImposterRole("host", game.SessionId);
        game.Manager.ReadyImposterRole("guest-1", game.SessionId);
        game.Manager.ReadyImposterRole("guest-2", game.SessionId);
        Assert.Equal(game.SecondGuestId,
            game.Manager.GetImposterSnapshot("guest-1", game.SessionId).CurrentSpeakerPlayerId);
    }

    [Fact]
    public void HostBackgroundSelectionIsAuthoritativeAndSurvivesTheNextRound()
    {
        var game = CreateStartedGame();

        var guestRejection = Assert.Throws<RoomException>(() =>
            game.Manager.SetImposterBackground("guest-1", game.SessionId, "beach"));
        Assert.Equal("HOST_REQUIRED", guestRejection.Code);
        var invalidRejection = Assert.Throws<RoomException>(() =>
            game.Manager.SetImposterBackground("host", game.SessionId, "unknown"));
        Assert.Equal("INVALID_IMPOSTER_BACKGROUND", invalidRejection.Code);

        game.Manager.SetImposterBackground("host", game.SessionId, "beach");
        Assert.Equal("beach", game.Manager.GetImposterSnapshot("host", game.SessionId).BackgroundId);
        Assert.Equal("beach", game.Manager.GetImposterSnapshot("guest-1", game.SessionId).BackgroundId);

        game.Manager.ReadyImposterRole("host", game.SessionId);
        game.Manager.ReadyImposterRole("guest-1", game.SessionId);
        game.Manager.ReadyImposterRole("guest-2", game.SessionId);
        game.Manager.CompleteImposterClue("host", game.SessionId);
        game.Manager.CompleteImposterClue("guest-1", game.SessionId);
        game.Manager.CompleteImposterClue("guest-2", game.SessionId);
        game.Manager.CastImposterVote("host", new CastImposterVoteRequest(game.SessionId, game.FirstGuestId));
        game.Manager.CastImposterVote("guest-1", new CastImposterVoteRequest(game.SessionId, game.HostId));
        game.Manager.CastImposterVote("guest-2", new CastImposterVoteRequest(game.SessionId, game.HostId));
        game.Manager.StartNextImposterRound("host", game.SessionId);

        Assert.Equal("beach", game.Manager.GetImposterSnapshot("guest-1", game.SessionId).BackgroundId);
    }

    private static StartedImposterGame CreateVotingGame()
    {
        var game = CreateStartedGame();
        game.Manager.ReadyImposterRole("host", game.SessionId);
        game.Manager.ReadyImposterRole("guest-1", game.SessionId);
        game.Manager.ReadyImposterRole("guest-2", game.SessionId);
        game.Manager.CompleteImposterClue("host", game.SessionId);
        game.Manager.CompleteImposterClue("guest-1", game.SessionId);
        game.Manager.CompleteImposterClue("guest-2", game.SessionId);
        return game;
    }

    private static StartedImposterGame CreateStartedGame(IRoomRandom? random = null)
    {
        var manager = new RoomManager(
            TimeProvider.System,
            Options.Create(new RoomOptions
            {
                DisconnectGraceSeconds = 25,
                QuestionLoadingMilliseconds = 1800,
            }),
            random ?? new FixedRoomRandom(),
            HideSeekTestSupport.CreateManager());
        var host = manager.Create(new CreateRoomRequest("Yağmur", "#654321", "Sprint Retro", 10, 30, 30));
        var firstGuest = manager.Join(host.RoomCode, new JoinRoomRequest("Ali", "#123456"));
        var secondGuest = manager.Join(host.RoomCode, new JoinRoomRequest("Ece", "#abcdef"));
        manager.Attach(host.RoomCode, host.PlayerId, host.ReconnectToken, "host");
        manager.Attach(host.RoomCode, firstGuest.PlayerId, firstGuest.ReconnectToken, "guest-1");
        manager.Attach(host.RoomCode, secondGuest.PlayerId, secondGuest.ReconnectToken, "guest-2");
        manager.BeginGameSelection("host", ["imposter"]);
        manager.CastVote("host", "imposter");
        var resolution = manager.ResolveVote("host");
        return new StartedImposterGame(
            manager,
            resolution.Snapshot.CurrentGameSession!.GameSessionId,
            host.PlayerId,
            firstGuest.PlayerId,
            secondGuest.PlayerId);
    }

    private sealed record StartedImposterGame(
        RoomManager Manager,
        string SessionId,
        string HostId,
        string FirstGuestId,
        string SecondGuestId);

    private sealed class FixedRoomRandom : IRoomRandom
    {
        public int Next(int maximumExclusive) => 0;
        public int Next(int minimumInclusive, int maximumExclusive) => minimumInclusive;
    }

    private sealed class SequenceRoomRandom(params int[] values) : IRoomRandom
    {
        private int _index;
        public int Next(int maximumExclusive) => values[_index++] % maximumExclusive;
        public int Next(int minimumInclusive, int maximumExclusive) =>
            minimumInclusive + values[_index++] % (maximumExclusive - minimumInclusive);
    }
}
