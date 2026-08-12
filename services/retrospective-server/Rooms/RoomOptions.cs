namespace Retrospective.Server.Rooms;

public sealed class RoomOptions
{
    public int DisconnectGraceSeconds { get; set; } = 25;
    public int QuestionLoadingMilliseconds { get; set; } = 1800;
}
