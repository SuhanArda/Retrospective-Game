namespace Retrospective.Server.Contracts;

public sealed record CreateRoomRequest(
    string DisplayName,
    string Color,
    string RoomName,
    int MaxParticipants = 10,
    int QuestionTimeSeconds = 30,
    int VotingTimeSeconds = 30,
    string? FileName = null,
    string? Description = null);

public sealed record JoinRoomRequest(string DisplayName, string Color);

public sealed record RoomAdmission(
    string RoomCode,
    string PlayerId,
    string DisplayName,
    bool IsHost,
    string ReconnectToken,
    RoomSnapshot Room,
    RoomPlayerSnapshot Player);

public sealed record RoomPlayerSnapshot(
    string Id,
    string DisplayName,
    string Color,
    bool IsHost,
    bool IsReady,
    bool IsConnected,
    long JoinedAt);

public sealed record GameSessionSnapshot(
    string GameSessionId,
    string GameId,
    string RoundId,
    int Seed,
    string State);

public sealed record TieBreakSnapshot(
    IReadOnlyList<string> Candidates,
    string Winner);

public sealed record SpinBottleStateSnapshot(
    string SpinId,
    string SpinnerPlayerId,
    string TargetPlayerId,
    int TargetIndex,
    string? Category,
    string? QuestionId,
    string? QuestionText,
    string Status,
    int Revision,
    long UpdatedAtUtc,
    long? StateEndsAtUtc);

public sealed record RoomSnapshot(
    string Id,
    string Code,
    string RoomName,
    string HostPlayerId,
    IReadOnlyList<RoomPlayerSnapshot> Players,
    string? SelectedGameId,
    string Status,
    int MaxParticipants,
    int QuestionTimeSeconds,
    int VotingTimeSeconds,
    IReadOnlyDictionary<string, string> Votes,
    long? VotingStartedAt,
    long? VotingEndsAt,
    IReadOnlyList<string> CandidateGameIds,
    TieBreakSnapshot? TieBreak,
    string? FileName,
    string? Description,
    long CreatedAt,
    GameSessionSnapshot? CurrentGameSession,
    SpinBottleStateSnapshot? SpinBottleState);

public sealed record SpinResult(
    string SpinId,
    string GameSessionId,
    string RoundId,
    string SpinnerPlayerId,
    string TargetPlayerId,
    int TargetIndex,
    int FinalAngle,
    int DurationMs,
    long CreatedAt);

public sealed record RoomReaction(
    string PlayerId,
    string DisplayName,
    string Color,
    string Emoji,
    long SentAt);

public sealed record HubJoinResult(bool Ok, RoomSnapshot? Room = null, string? Error = null);
