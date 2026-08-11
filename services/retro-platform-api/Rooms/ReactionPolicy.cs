namespace RetroPlatform.Api.Rooms;

/// <summary>
/// Which emoji a client may send, and how fast. Both halves are decided here
/// rather than in the browser, because a reaction is broadcast to everyone
/// else's screen: neither the payload nor the pace can be left to the sender.
///
/// Reactions are deliberately not part of <c>RetroRoom</c>. They are momentary
/// events — the server forwards one and forgets it — so they never enter the
/// room snapshot that clients replace their copy with.
/// </summary>
public sealed class ReactionPolicy(TimeProvider timeProvider)
{
    /// <summary>
    /// The whole vocabulary. Anything outside this set is refused, which is what
    /// keeps the reaction channel from becoming a way to put arbitrary text on
    /// other people's screens.
    ///
    /// Compared by exact code points: "❤️" is U+2764 followed by U+FE0F, and the
    /// bare U+2764 is a different string. The client's list must match this one
    /// character for character — see <c>REACTION_EMOJI</c> in
    /// <c>apps/retro-platform-web/src/domain/reactions.ts</c>.
    /// </summary>
    private static readonly HashSet<string> Allowed = new(StringComparer.Ordinal)
    {
        "👍", "😂", "🔥", "❤️", "🎉", "👀", "💀", "🤡", "🥱", "🗿",
        "🫠", "🤯", "🫡", "🙏", "🧠", "🍿", "🐐", "🚀",
    };

    /// <summary>Reactions one player may send per <see cref="Window"/>.</summary>
    public const int MaxPerWindow = 5;

    public static readonly TimeSpan Window = TimeSpan.FromSeconds(1);

    /// <summary>Send times per player, oldest first, pruned to <see cref="Window"/>.</summary>
    private readonly Dictionary<string, Queue<long>> _recent = new(StringComparer.Ordinal);

    private readonly Lock _gate = new();

    public static IReadOnlyCollection<string> AllowedEmoji => Allowed;

    public static bool IsAllowed(string emoji) => Allowed.Contains(emoji);

    /// <summary>
    /// Records a send and reports whether it fits inside the player's budget.
    /// False means "over the limit" — the caller drops the reaction rather than
    /// reporting an error, since holding the button down is the intended way to
    /// use this and a stream of errors would be worse than silence.
    /// </summary>
    public bool TryRecord(string playerId)
    {
        var now = timeProvider.GetUtcNow().ToUnixTimeMilliseconds();
        var cutoff = now - (long)Window.TotalMilliseconds;

        lock (_gate)
        {
            if (!_recent.TryGetValue(playerId, out var sends))
            {
                sends = new Queue<long>();
                _recent[playerId] = sends;
            }

            while (sends.Count > 0 && sends.Peek() <= cutoff) sends.Dequeue();
            if (sends.Count >= MaxPerWindow) return false;

            sends.Enqueue(now);
            return true;
        }
    }

    /// <summary>
    /// Drops a player's history. Called when they leave so the table does not
    /// keep a row for everyone who has ever been in a room on this server.
    /// </summary>
    public void Forget(string playerId)
    {
        lock (_gate) _recent.Remove(playerId);
    }
}
