namespace Retrospective.Server.Contracts;

public sealed record CreateRoomRequest(
    string DisplayName,
    string Color,
    string RoomName,
    int MaxParticipants = 10,
    int QuestionTimeSeconds = 30,
    int VotingTimeSeconds = 30,
    string? FileName = null,
    string? Description = null,
    string? AvatarId = null);

public sealed record JoinRoomRequest(string DisplayName, string Color, string? AvatarId = null);

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
    long JoinedAt,
    string? AvatarId = null);

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

/// <summary>
/// The secret word is deliberately absent — the server hands it out only to
/// the current drawer, via <c>RequestDrawAndGuessWord</c>'s return value,
/// which SignalR delivers only to whoever called it. Scores accumulate
/// across the whole game (not just the current round), the same way a
/// scoreboard should.
/// </summary>
public sealed record DrawAndGuessStateSnapshot(
    string DrawerPlayerId,
    int RoundNumber,
    IReadOnlyList<string> CorrectGuesserIds,
    IReadOnlyDictionary<string, int> Scores,
    int Revision,
    long UpdatedAtUtc,
    long RoundEndsAtUtc,
    int WordLength,
    IReadOnlyDictionary<int, char> RevealedLetters,
    int? LastRevealedIndex);

/// <summary>
/// A correct guess never carries the word back to the room — only who got
/// it and in what order. A wrong guess carries the guessed text as-is,
/// since it was never the answer.
/// </summary>
public sealed record DrawAndGuessGuessResult(
    string PlayerId,
    string DisplayName,
    bool Correct,
    int? Rank,
    string? Text,
    int? Points);

public sealed record DrawAndGuessWordReveal(string Word, int Revision);

/// <summary>
/// A drawing stroke point batch, relayed verbatim to everyone else in the
/// room. The server never inspects or stores this — it is not part of any
/// player's score or the room's authoritative state, just a pass-through so
/// the canvas stays live for spectators.
/// </summary>
public sealed record DrawAndGuessStrokeEvent(
    string PlayerId,
    IReadOnlyList<double> Points,
    bool NewStroke,
    string Color,
    bool IsEraser);

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
    RussianRouletteStateSnapshot? RussianRouletteState,
    DrawAndGuessStateSnapshot? DrawAndGuessState);

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
