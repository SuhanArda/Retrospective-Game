namespace Retrospective.Server.Rooms;

public sealed class AiQuestionOptions
{
    public int ColdStartTimeoutSeconds { get; set; } = 90;
    public const int GenerationTimeoutSeconds = 40;
    public const int HealthProbeTimeoutSeconds = 10;
    public const int InitialReadinessDelaySeconds = 2;
    public const int MaximumReadinessDelaySeconds = 15;
}
