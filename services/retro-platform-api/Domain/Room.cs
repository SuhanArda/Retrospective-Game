namespace RetroPlatform.Api.Domain;

/// <summary>
/// Room lifecycle values. These are plain strings rather than an enum because
/// they cross the wire into the TypeScript union in <c>domain/room.ts</c>;
/// keeping them literal removes any chance of a serialization mismatch.
/// </summary>
public static class RoomStatus
{
    public const string Lobby = "LOBBY";
    public const string GameSelection = "GAME_SELECTION";
    public const string Playing = "PLAYING";
    public const string Finished = "FINISHED";
}

public sealed record RoomPlayer
{
    public required string Id { get; init; }
    public required string DisplayName { get; init; }
    public required string Color { get; init; }
    public required bool IsHost { get; init; }
    public required bool IsReady { get; init; }

    /// <summary>
    /// Unix ms when this player's connection dropped, or null while connected.
    /// A refresh drops the socket too, so players are kept in the room for a
    /// short grace period instead of being removed the moment they disappear.
    /// </summary>
    public long? DisconnectedAt { get; init; }
}

public sealed record TieBreak
{
    public required IReadOnlyList<string> Candidates { get; init; }
    public required string Winner { get; init; }
}

/// <summary>
/// Mirrors <c>RetroRoom</c> in the web app. Immutable: every change produces a
/// new snapshot, which is what gets broadcast to the room's SignalR group.
/// </summary>
public sealed record RetroRoom
{
    public required string Id { get; init; }
    public required string Code { get; init; }
    public required string RoomName { get; init; }
    public required string HostPlayerId { get; init; }
    public required IReadOnlyList<RoomPlayer> Players { get; init; }
    public required string Status { get; init; }
    public required int MaxParticipants { get; init; }
    public required int QuestionTimeSeconds { get; init; }
    public required int VotingTimeSeconds { get; init; }
    public required long CreatedAt { get; init; }

    public string? SelectedGameId { get; init; }
    /// <summary>playerId -> gameId, collected during GAME_SELECTION.</summary>
    public IReadOnlyDictionary<string, string>? Votes { get; init; }
    /// <summary>Unix ms when the vote closes; null once it is resolved.</summary>
    public long? VotingEndsAt { get; init; }
    /// <summary>
    /// The games on offer this round, supplied when the vote opens so the
    /// server can close it on time without knowing the client's catalogue.
    /// TODO: move the catalogue itself server-side once games are registered there.
    /// </summary>
    public IReadOnlyList<string>? CandidateGameIds { get; init; }
    public TieBreak? TieBreak { get; init; }
    public string? FileName { get; init; }
    public string? Description { get; init; }
}
