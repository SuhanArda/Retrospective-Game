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
    int RoundId);

public sealed record RetroRushQuestionSnapshot(
    string QuestionId,
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

public sealed record RetroRushGameSnapshot(
    string GameSessionId,
    int RoundId,
    int MapSeed,
    string Phase,
    long PhaseStartedAtUtc,
    long RoundStartsAtUtc,
    IReadOnlyList<RetroRushPlayerSnapshot> Players,
    IReadOnlyList<string> CollectedPickupIds,
    IReadOnlyList<RetroRushRocketSnapshot> ActiveRockets,
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
public sealed record RetroRushPlayerEliminated(int RoundId, string PlayerId, RetroRushQuestionSnapshot Question);
public sealed record CompleteRetroRushQuestionRequest(string GameSessionId, int RoundId, string QuestionId);
public sealed record UseRetroRushAbilityRequest(string GameSessionId, int RoundId, string AbilityId);
public sealed record RequestRetroRushAskTargetRequest(string GameSessionId, int RoundId, string TargetPlayerId);
public sealed record RetroRushTargetQuestioned(int RoundId, string SourcePlayerId, string TargetPlayerId);
