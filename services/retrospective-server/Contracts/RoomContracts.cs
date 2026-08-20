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
    long? RoundStartAtUnixMs,
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

/// <summary>
/// The wire shape of the roulette cylinder deliberately omits which chamber
/// holds the bullet and which one is up next — a client that could read
/// those in the room snapshot could see a hit coming before firing.
/// </summary>
public sealed record RussianRouletteStateSnapshot(
    string HolderPlayerId,
    string Status,
    string? LastShooterPlayerId,
    string? LastTargetPlayerId,
    bool? LastShotHit,
    string? QuestionId,
    string? QuestionText,
    int Revision,
    long UpdatedAtUtc);

public sealed record FireResult(
    string GameSessionId,
    string RoundId,
    string ShooterPlayerId,
    string TargetPlayerId,
    bool Hit,
    long CreatedAt);

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
    SpinBottleStateSnapshot? SpinBottleState,
    RussianRouletteStateSnapshot? RussianRouletteState);

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

public sealed record GenerateRoomQuestionsRequest(
    string? Topic,
    string? ReportText,
    string Language,
    string Style,
    int Count = 20,
    ReportFilePayload? ReportFile = null,
    bool ReplaceExisting = false);

public sealed record ReportFilePayload(string Name, string MimeType, string DataBase64);

public sealed record RoomAiAccess(string RoomCode, string RoomInstanceId, string PlayerId, bool IsHost);
