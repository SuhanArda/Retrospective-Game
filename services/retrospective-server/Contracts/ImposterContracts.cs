namespace Retrospective.Server.Contracts;

public sealed record ImposterPlayerSnapshot(
    string PlayerId,
    string DisplayName,
    int AvatarIndex,
    bool IsConnected,
    bool HasRevealedRole,
    bool HasGivenClue,
    bool HasVoted);

public sealed record ImposterResultSnapshot(
    string ImposterPlayerId,
    IReadOnlyList<string> SuspectedPlayerIds,
    bool ImposterCaught);

/// <summary>
/// A participant-specific snapshot. SecretWord is deliberately null for the
/// Imposter until RESULTS and this shape is never broadcast to the room.
/// </summary>
public sealed record ImposterGameSnapshot(
    string GameSessionId,
    int RoundNumber,
    int Revision,
    string Phase,
    string BackgroundId,
    IReadOnlyList<ImposterPlayerSnapshot> Players,
    string? CurrentSpeakerPlayerId,
    string YourRole,
    string? SecretWord,
    string? WordCategory,
    string? RetroQuestion,
    bool HasVoted,
    ImposterResultSnapshot? Result);

public sealed record ImposterStateChanged(
    string GameSessionId,
    int RoundNumber,
    int Revision);

public sealed record CastImposterVoteRequest(
    string GameSessionId,
    string TargetPlayerId);
