namespace Retrospective.Server.Contracts;

public sealed record RetroRushPlayerSnapshot(
    string PlayerId,
    string DisplayName,
    string Color,
    int Slot,
    int SkinIndex,
    bool Connected,
    double X,
    double Y,
    double VelocityX,
    double VelocityY,
    string Facing,
    string MovementState,
    string AnimationState,
    long Sequence,
    long ClientTimestamp,
    int RoundId,
    IReadOnlyList<string> OwnedAbilityIds);

public sealed record RetroRushQuestionSnapshot(
    string QuestionId,
    int QuestionIndex,
    string OwnerPlayerId,
    string Status,
    int RoundId,
    string Category,
    string Type,
    string Prompt,
    IReadOnlyList<string>? Options,
    bool Required);

public sealed record RetroRushRocketSnapshot(
    string RocketId,
    string OwnerPlayerId,
    string TargetPlayerId,
    double X,
    double Y,
    long SpawnedAtUtc,
    int RoundId);

public sealed record RetroRushEliminationSnapshot(
    string PlayerId,
    long EliminatedAtUnixMs,
    int Order);

public sealed record RetroRushRankingEntry(
    string PlayerId,
    string DisplayName,
    string Color,
    int Place,
    double ProgressX,
    bool Eliminated,
    long? EliminatedAtUnixMs);

public sealed record RetroRushGameSnapshot(
    string GameSessionId,
    int RoundId,
    int MapSeed,
    string Phase,
    long PhaseStartedAtUtc,
    long RoundStartAtUnixMs,
    long RoundDeadlineAtUnixMs,
    long ResultsEndAtUnixMs,
    double SpawnX,
    double SpawnY,
    IReadOnlyList<RetroRushPlayerSnapshot> Players,
    IReadOnlyList<string> CollectedPickupIds,
    IReadOnlyList<RetroRushRocketSnapshot> ActiveRockets,
    IReadOnlyList<RetroRushEliminationSnapshot> EliminationOrder,
    IReadOnlyList<RetroRushRankingEntry> Ranking,
    string? LastPlacePlayerId,
    RetroRushQuestionSnapshot? ActiveQuestion);

public sealed record UpdateRetroRushPlayerRequest(
    string GameSessionId,
    string PlayerId,
    int RoundId,
    double X,
    double Y,
    double VelocityX,
    double VelocityY,
    string Facing,
    string MovementState,
    string AnimationState,
    long Sequence,
    long ClientTimestamp);

public sealed record RequestRetroRushShoveRequest(
    string GameSessionId,
    int RoundId,
    string TargetPlayerId,
    long Sequence);

public sealed record RetroRushShoveApplied(
    string ActionId,
    int RoundId,
    string AttackerPlayerId,
    string TargetPlayerId,
    double VelocityX,
    int HitStunMs);

public sealed record RetroRushShoveCommandResult(bool Accepted, string? Rejection = null);

public sealed record RequestRetroRushRocketFireRequest(string GameSessionId, int RoundId);
public sealed record RequestRetroRushRocketHitRequest(string GameSessionId, int RoundId, string RocketId);

public sealed record RetroRushRocketHitApplied(
    string RocketId,
    int RoundId,
    string TargetPlayerId,
    double VelocityX,
    int HitStunMs);

public sealed record RequestRetroRushPickupCollectionRequest(
    string GameSessionId,
    int RoundId,
    string PickupId,
    string AbilityId);

public sealed record RetroRushPickupCollected(
    string PickupId,
    int RoundId,
    string PlayerId,
    string AbilityId);

public sealed record RequestRetroRushPlayerEliminationRequest(string GameSessionId, int RoundId, string PlayerId);
public sealed record RetroRushPlayerEliminated(int RoundId, string PlayerId, long EliminatedAtUnixMs, int Order);
public sealed record CompleteRetroRushQuestionRequest(string GameSessionId, int RoundId, string QuestionId);
public sealed record UseRetroRushAbilityRequest(string GameSessionId, int RoundId, string AbilityId);
public sealed record RequestRetroRushAskTargetRequest(string GameSessionId, int RoundId, string TargetPlayerId);
public sealed record RetroRushTargetQuestioned(int RoundId, string SourcePlayerId, string TargetPlayerId);
