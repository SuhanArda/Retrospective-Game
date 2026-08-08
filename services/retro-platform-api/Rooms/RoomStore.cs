using System.Collections.Concurrent;
using RetroPlatform.Api.Domain;

namespace RetroPlatform.Api.Rooms;

public enum RoomError
{
    None,
    NotFound,
    Full,
    AlreadyStarted,
    InvalidCode,
    HostRequired,
    NotInRoom,
}

public sealed record RoomResult(RetroRoom? Room, RoomError Error = RoomError.None)
{
    public bool Ok => Error == RoomError.None && Room is not null;
    public static RoomResult Fail(RoomError error) => new(null, error);
}

public sealed record CreateRoomRequest(
    string DisplayName,
    string Color,
    string RoomName,
    int MaxParticipants,
    int QuestionTimeSeconds,
    int VotingTimeSeconds,
    string? FileName = null,
    string? Description = null);

/// <summary>
/// The authority for every room. Rooms live in memory only — restarting the
/// service drops them, which is acceptable while there is no database, but it
/// is the reason this type stays free of persistence concerns.
///
/// All mutations run under one lock. Traffic is a handful of messages per
/// room per minute, so the simplicity is worth far more than the contention
/// a finer-grained scheme would save.
/// </summary>
public sealed class RoomStore(TimeProvider timeProvider)
{
    // Excludes characters that are easy to misread aloud (0/O, 1/I).
    private const string CodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private const int CodeLength = 6;

    private readonly ConcurrentDictionary<string, RetroRoom> _rooms = new(StringComparer.Ordinal);
    private readonly Lock _gate = new();
    private readonly Random _random = new();

    private long NowMs => timeProvider.GetUtcNow().ToUnixTimeMilliseconds();

    public RetroRoom? Get(string roomCode) =>
        _rooms.TryGetValue(Normalize(roomCode), out var room) ? room : null;

    public IReadOnlyList<RetroRoom> All() => _rooms.Values.ToList();

    public static string Normalize(string roomCode) => roomCode.Trim().ToUpperInvariant();

    public static bool IsValidCode(string roomCode) =>
        roomCode.Length == CodeLength && roomCode.All(char.IsAsciiLetterOrDigit);

    public (RetroRoom Room, RoomPlayer Player) Create(CreateRoomRequest request)
    {
        lock (_gate)
        {
            var host = new RoomPlayer
            {
                Id = Guid.NewGuid().ToString("N"),
                DisplayName = request.DisplayName.Trim(),
                Color = request.Color,
                IsHost = true,
                IsReady = true,
            };
            var room = new RetroRoom
            {
                Id = Guid.NewGuid().ToString("N"),
                Code = NextUniqueCode(),
                RoomName = request.RoomName.Trim(),
                HostPlayerId = host.Id,
                Players = [host],
                Status = RoomStatus.Lobby,
                MaxParticipants = Math.Clamp(request.MaxParticipants, 2, 50),
                QuestionTimeSeconds = request.QuestionTimeSeconds,
                VotingTimeSeconds = request.VotingTimeSeconds,
                CreatedAt = NowMs,
                FileName = request.FileName,
                Description = string.IsNullOrWhiteSpace(request.Description)
                    ? null
                    : request.Description.Trim(),
            };
            _rooms[room.Code] = room;
            return (room, host);
        }
    }

    public (RoomResult Result, RoomPlayer? Player) Join(string roomCode, string displayName, string color)
    {
        var code = Normalize(roomCode);
        if (!IsValidCode(code)) return (RoomResult.Fail(RoomError.InvalidCode), null);

        lock (_gate)
        {
            if (!_rooms.TryGetValue(code, out var room)) return (RoomResult.Fail(RoomError.NotFound), null);
            if (room.Status is RoomStatus.Playing or RoomStatus.Finished)
            {
                return (RoomResult.Fail(RoomError.AlreadyStarted), null);
            }
            if (room.Players.Count >= room.MaxParticipants) return (RoomResult.Fail(RoomError.Full), null);

            var player = new RoomPlayer
            {
                Id = Guid.NewGuid().ToString("N"),
                DisplayName = displayName.Trim(),
                Color = color,
                IsHost = false,
                IsReady = false,
            };
            var next = room with { Players = [.. room.Players, player] };
            _rooms[code] = next;
            return (new RoomResult(next), player);
        }
    }

    /// <summary>Removes a player, handing the host role on and deleting the room once it empties.</summary>
    public RoomResult Leave(string roomCode, string playerId)
    {
        lock (_gate)
        {
            return LeaveCore(Normalize(roomCode), playerId);
        }
    }

    /// <summary>Caller must already hold <see cref="_gate"/>.</summary>
    private RoomResult LeaveCore(string code, string playerId)
    {
        if (!_rooms.TryGetValue(code, out var room)) return RoomResult.Fail(RoomError.NotFound);

        var remaining = room.Players.Where(p => p.Id != playerId).ToList();
        if (remaining.Count == 0)
        {
            _rooms.TryRemove(code, out _);
            return new RoomResult(null);
        }

        var hostId = room.HostPlayerId == playerId ? remaining[0].Id : room.HostPlayerId;
        var next = room with
        {
            HostPlayerId = hostId,
            Players = remaining.Select(p => p with { IsHost = p.Id == hostId }).ToList(),
        };
        _rooms[code] = next;
        return new RoomResult(next);
    }

    public RoomResult BeginGameSelection(string roomCode, string playerId, IReadOnlyList<string> candidateGameIds)
    {
        lock (_gate)
        {
            var code = Normalize(roomCode);
            if (!_rooms.TryGetValue(code, out var room)) return RoomResult.Fail(RoomError.NotFound);
            if (room.HostPlayerId != playerId) return RoomResult.Fail(RoomError.HostRequired);

            var next = room with
            {
                Status = RoomStatus.GameSelection,
                Votes = new Dictionary<string, string>(),
                VotingEndsAt = NowMs + room.VotingTimeSeconds * 1000L,
                CandidateGameIds = candidateGameIds.ToList(),
                SelectedGameId = null,
                TieBreak = null,
            };
            _rooms[code] = next;
            return new RoomResult(next);
        }
    }

    public RoomResult CastVote(string roomCode, string playerId, string gameId)
    {
        lock (_gate)
        {
            var code = Normalize(roomCode);
            if (!_rooms.TryGetValue(code, out var room)) return RoomResult.Fail(RoomError.NotFound);
            if (room.Players.All(p => p.Id != playerId)) return RoomResult.Fail(RoomError.NotInRoom);
            // Late votes are dropped rather than reopening a decided round.
            if (room.Status != RoomStatus.GameSelection) return new RoomResult(room);

            var votes = new Dictionary<string, string>(room.Votes ?? new Dictionary<string, string>())
            {
                [playerId] = gameId,
            };
            var next = room with { Votes = votes };
            _rooms[code] = next;
            return new RoomResult(next);
        }
    }

    /// <summary>
    /// Closes the vote. <paramref name="playerId"/> is null when the countdown
    /// expired and the server is closing it on the room's behalf.
    /// </summary>
    public RoomResult ResolveVote(string roomCode, string? playerId, IReadOnlyList<string> candidateIds)
    {
        lock (_gate)
        {
            var code = Normalize(roomCode);
            if (!_rooms.TryGetValue(code, out var room)) return RoomResult.Fail(RoomError.NotFound);
            if (playerId is not null && room.HostPlayerId != playerId)
            {
                return RoomResult.Fail(RoomError.HostRequired);
            }
            // Whoever gets here first decides; a second call is a no-op.
            if (room.Status != RoomStatus.GameSelection) return new RoomResult(room);

            var outcome = VoteResolver.Resolve(room.Votes, candidateIds, _random);
            if (outcome is null) return new RoomResult(room);

            var next = room with
            {
                Status = RoomStatus.Playing,
                SelectedGameId = outcome.Winner,
                VotingEndsAt = null,
                TieBreak = outcome.TiedCandidates.Count > 1
                    ? new TieBreak { Candidates = outcome.TiedCandidates, Winner = outcome.Winner }
                    : null,
            };
            _rooms[code] = next;
            return new RoomResult(next);
        }
    }

    public RoomResult ReturnToLobby(string roomCode, string playerId)
    {
        lock (_gate)
        {
            var code = Normalize(roomCode);
            if (!_rooms.TryGetValue(code, out var room)) return RoomResult.Fail(RoomError.NotFound);
            if (room.HostPlayerId != playerId) return RoomResult.Fail(RoomError.HostRequired);

            var next = room with
            {
                Status = RoomStatus.Lobby,
                Votes = new Dictionary<string, string>(),
                VotingEndsAt = null,
                SelectedGameId = null,
                TieBreak = null,
            };
            _rooms[code] = next;
            return new RoomResult(next);
        }
    }

    /// <summary>
    /// Flags a player as disconnected without removing them. Refreshing the page
    /// drops the socket, so tearing the player out here would eject people from
    /// their own room every reload; <see cref="SweepDisconnected"/> does the
    /// actual removal once the grace period passes.
    /// </summary>
    public RoomResult MarkDisconnected(string roomCode, string playerId)
    {
        lock (_gate)
        {
            var code = Normalize(roomCode);
            if (!_rooms.TryGetValue(code, out var room)) return RoomResult.Fail(RoomError.NotFound);
            var next = room with
            {
                Players = room.Players
                    .Select(p => p.Id == playerId ? p with { DisconnectedAt = NowMs } : p)
                    .ToList(),
            };
            _rooms[code] = next;
            return new RoomResult(next);
        }
    }

    /// <summary>Puts a returning player back on their feet after a reload.</summary>
    public RoomResult MarkReconnected(string roomCode, string playerId)
    {
        lock (_gate)
        {
            var code = Normalize(roomCode);
            if (!_rooms.TryGetValue(code, out var room)) return RoomResult.Fail(RoomError.NotFound);
            if (room.Players.All(p => p.Id != playerId)) return RoomResult.Fail(RoomError.NotInRoom);
            var next = room with
            {
                Players = room.Players
                    .Select(p => p.Id == playerId ? p with { DisconnectedAt = null } : p)
                    .ToList(),
            };
            _rooms[code] = next;
            return new RoomResult(next);
        }
    }

    /// <summary>
    /// Removes players who never came back. Returns a snapshot per affected room:
    /// null <see cref="RoomResult.Room"/> means the room emptied and is gone, so
    /// the caller can tell the remaining clients apart from nobody at all.
    /// </summary>
    public IReadOnlyList<(string Code, RetroRoom? Room)> SweepDisconnected(long graceMs)
    {
        lock (_gate)
        {
            var cutoff = NowMs - graceMs;
            var changed = new List<(string, RetroRoom?)>();

            foreach (var room in _rooms.Values.ToList())
            {
                var expired = room.Players
                    .Where(p => p.DisconnectedAt is not null && p.DisconnectedAt <= cutoff)
                    .Select(p => p.Id)
                    .ToList();
                if (expired.Count == 0) continue;

                RetroRoom? latest = room;
                foreach (var playerId in expired)
                {
                    latest = LeaveCore(room.Code, playerId).Room;
                    if (latest is null) break;
                }
                changed.Add((room.Code, latest));
            }
            return changed;
        }
    }

    /// <summary>Rooms whose voting countdown has run out and still need a result.</summary>
    public IReadOnlyList<RetroRoom> ExpiredVotes()
    {
        var now = NowMs;
        return _rooms.Values
            .Where(r => r.Status == RoomStatus.GameSelection && r.VotingEndsAt is not null && r.VotingEndsAt <= now)
            .ToList();
    }

    private string NextUniqueCode()
    {
        // Collisions are vanishingly unlikely, but a duplicate code would let a
        // player walk into the wrong room, so it is checked rather than assumed.
        for (var attempt = 0; attempt < 100; attempt++)
        {
            var code = string.Create(CodeLength, _random, static (span, rng) =>
            {
                for (var i = 0; i < span.Length; i++) span[i] = CodeAlphabet[rng.Next(CodeAlphabet.Length)];
            });
            if (!_rooms.ContainsKey(code)) return code;
        }
        throw new InvalidOperationException("Could not allocate a unique room code.");
    }
}
