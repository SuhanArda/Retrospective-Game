namespace Retrospective.Server.Contracts;

public sealed record WheelQuestionSnapshot(string Id, string Text);

public sealed record WheelSpinSnapshot(
    string SpinId,
    string SelectedId,
    int SelectedIndex,
    long StartedAtUnixMs,
    int DurationMs);

public sealed record WheelOfFortuneStateSnapshot(
    string GameSessionId,
    string Phase,
    IReadOnlyList<WheelQuestionSnapshot> Questions,
    IReadOnlyList<string> UsedQuestionIds,
    WheelSpinSnapshot? PlayerSpin,
    WheelSpinSnapshot? QuestionSpin,
    string? SelectedPlayerId,
    string? SelectedQuestionId,
    int RoundNumber,
    int Revision,
    long UpdatedAtUnixMs,
    long ServerTimeUnixMs);

public sealed record WheelQuestionRequest(string GameSessionId, string Text);
public sealed record UpdateWheelQuestionRequest(string GameSessionId, string QuestionId, string Text);
public sealed record WheelGameRequest(string GameSessionId);
