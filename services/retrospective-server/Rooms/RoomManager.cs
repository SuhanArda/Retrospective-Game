using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;
using Retrospective.Server.Contracts;

namespace Retrospective.Server.Rooms;

public sealed partial class RoomManager(TimeProvider timeProvider, IOptions<RoomOptions> options, IRoomRandom roomRandom)
{
    private const string Alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static readonly HashSet<string> SupportedGames = ["retro-rush", "spin-the-bottle", "rus-ruleti", "draw-and-guess", "imposter"];
    private static readonly string[] RouletteQuestions =
    [
        "Bu sprintte seni en çok ne yordu?",
        "Takımdan en çok neye güvendin?",
        "Hangi kararı bir daha alsan farklı alırdın?",
        "Bu dönem kimden ne öğrendin?",
        "Önümüzdeki sprintte neyi değiştirmek istersin?",
    ];
    // Not tied to player count on purpose — see the client-side comment this mirrors.
    private const int MinChambers = 5;
    private const int MaxChambers = 12;
    private static readonly HashSet<int> SupportedVotingDurations = [15, 30, 45, 60];
    private static readonly IReadOnlyDictionary<string, string[]> SpinQuestions = new Dictionary<string, string[]>(StringComparer.Ordinal)
    {
        ["İş"] =
        [
            "Bu sprintte en iyi yaptığımız şey neydi?",
            "Bu sprintte bizi en çok zorlayan konu neydi?",
            "Bir sonraki sprintte neyi farklı yapmalıyız?",
            "Takım içi iletişim ve görev dağılımı nasıldı?",
            "Bu sprintte öğrendiğin en önemli şey neydi?",
        ],
        ["Eğlence"] =
        [
            "Bu sprinti tek kelimeyle anlatacak olsan ne derdin?",
            "Bu sprint bir film veya dizi olsaydı hangisi olurdu?",
            "Bu sprintte yaşadığın en komik veya unutamayacağın an neydi?",
            "Bu sprintte zamanı geri alabilseydin hangi ana geri dönmek isterdin?",
            "Sprint boyunca en çok söylediğin veya düşündüğün cümle neydi?",
        ],
    };
    /// <summary>
    /// Same list the standalone client prototype ships (games/draw-and-guess/src/data/words.ts)
    /// — kept in sync by hand since a word only needs to match on this side
    /// once a real room is involved; the client's own copy still backs its
    /// offline demo mode.
    /// </summary>
    private static readonly string[] DrawAndGuessWords =
    [
        "kedi", "köpek", "aslan", "fil", "zürafa", "penguen", "kaplumbağa",
        "tavşan", "kartal", "balina", "yılan", "maymun", "ayı", "kelebek",
        "örümcek", "papağan", "at", "inek", "koyun", "tavuk",
        "kurbağa", "timsah", "zebra", "panda", "koala", "kanguru", "yunus",
        "ahtapot", "karınca", "arı", "sincap", "geyik", "kurt", "tilki",
        "baykuş", "flamingo", "deve", "fare", "keçi", "ördek",
        "araba", "otobüs", "uçak", "tren", "bisiklet", "motosiklet", "gemi",
        "helikopter", "kamyon", "traktör", "roket", "denizaltı", "scooter",
        "ambulans", "itfaiye arabası",
        "taksi", "vapur", "yelkenli", "uçurtma", "paraşüt", "teleferik",
        "forklift", "çöp kamyonu", "polis arabası", "kaykay",
        "pizza", "hamburger", "elma", "muz", "karpuz", "dondurma", "pasta",
        "makarna", "çikolata", "ekmek", "peynir", "yumurta", "kahve", "çay",
        "patates kızartması", "sushi", "taco", "simit",
        "portakal", "çilek", "üzüm", "ananas", "limon", "salatalık", "domates",
        "havuç", "bal", "süt", "çorba", "kek",
    ];
    /// <summary>words.ts'deki RECENT_WORD_MEMORY ile aynı — son bu kadar kelime bir daha çıkmaz.</summary>
    private const int DrawAndGuessRecentWordMemory = 8;
    private static readonly int[] DrawAndGuessRankPoints = [10, 7, 5];
    private const int DrawAndGuessFallbackPoints = 3;
    private const int DrawAndGuessDrawerPointsPerCorrectGuesser = 2;
    /// <summary>Herkes bildikten sonra sıradaki tura otomatik geçmeden önceki bekleme — son tahmini/kutlamayı görsünler diye.</summary>
    private const int DrawAndGuessRoundCompleteDelayMs = 2500;
    /// <summary>Her turun süresi — kimse (ya da herkes) bilemezse bu süre dolunca kelime açıklanıp tur ilerler.</summary>
    private const int DrawAndGuessRoundDurationMs = 30_000;
    private readonly ConcurrentDictionary<string, GameRoom> _rooms = new(StringComparer.Ordinal);
    private readonly ConcurrentDictionary<string, PlayerConnection> _connections = new(StringComparer.Ordinal);
    private readonly TimeSpan _disconnectGrace = TimeSpan.FromSeconds(options.Value.DisconnectGraceSeconds);
    private readonly TimeSpan _questionLoadingTime = TimeSpan.FromMilliseconds(options.Value.QuestionLoadingMilliseconds);

    public RoomAdmission Create(CreateRoomRequest request)
    {
        ValidateName(request.DisplayName);
        if (string.IsNullOrWhiteSpace(request.RoomName) || request.RoomName.Trim().Length > 40)
            throw new RoomException("INVALID_ROOM_NAME");
        if (request.MaxParticipants is < 2 or > 50) throw new RoomException("INVALID_CAPACITY");
        if (!SupportedVotingDurations.Contains(request.VotingTimeSeconds))
            throw new RoomException("INVALID_VOTING_DURATION");

        GameRoom room;
        do
        {
            var code = CreateRoomCode();
            room = new GameRoom(Guid.NewGuid().ToString("N"), code, request.RoomName.Trim(), request.MaxParticipants,
                request.QuestionTimeSeconds, request.VotingTimeSeconds, request.FileName, request.Description,
                timeProvider.GetUtcNow().ToUnixTimeMilliseconds());
        } while (!_rooms.TryAdd(room.Code, room));

        lock (room.Gate)
        {
            var admission = AddPlayer(room, request.DisplayName, request.Color);
            room.HostPlayerId = admission.PlayerId;
            return admission with { IsHost = true, Room = Snapshot(room), Player = PlayerSnapshot(room, room.Players[admission.PlayerId]) };
        }
    }

    public RoomAdmission Join(string rawCode, JoinRoomRequest request)
    {
        ValidateName(request.DisplayName);
        var room = Find(rawCode);
        lock (room.Gate)
        {
            if (room.Status == RoomPhase.Playing) throw new RoomException("ROOM_ALREADY_STARTED");
            if (room.Players.Count >= room.MaxParticipants) throw new RoomException("ROOM_FULL");
            return AddPlayer(room, request.DisplayName, request.Color);
        }
    }

    public RoomSnapshot? Get(string rawCode)
    {
        var code = Normalize(rawCode);
        if (!_rooms.TryGetValue(code, out var room)) return null;
        lock (room.Gate) return Snapshot(room);
    }

    public RoomAiAccess AuthorizeAiAccess(string rawCode, string playerId, string token, bool hostRequired)
    {
        var room = Find(rawCode);
        lock (room.Gate)
        {
            var player = Authenticate(room, playerId, token);
            if (hostRequired && room.HostPlayerId != player.Id) throw new RoomException("HOST_REQUIRED");
            return new RoomAiAccess(room.Code, room.Id, player.Id, room.HostPlayerId == player.Id);
        }
    }

    public GenerateRoomQuestionsRequest RememberOrRestoreAiQuestionSource(
        string rawCode,
        GenerateRoomQuestionsRequest request)
    {
        var room = Find(rawCode);
        lock (room.Gate)
        {
            var topic = string.IsNullOrWhiteSpace(request.Topic) ? null : request.Topic.Trim();
            var reportText = string.IsNullOrWhiteSpace(request.ReportText) ? null : request.ReportText.Trim();
            var hasModeratorSource = topic is not null || reportText is not null || request.ReportFile is not null;

            if (hasModeratorSource)
            {
                room.AiQuestionSource = new AiQuestionSource(topic, reportText, request.ReportFile, request.Style);
                return request with { Topic = topic, ReportText = reportText };
            }

            if (room.AiQuestionSource is not { } source) return request;

            return request with
            {
                Topic = source.Topic,
                ReportText = source.ReportText,
                ReportFile = source.ReportFile,
                Style = source.Style,
            };
        }
    }

    public RoomSnapshot Attach(string rawCode, string playerId, string token, string connectionId)
    {
        var room = Find(rawCode);
        lock (room.Gate)
        {
            var player = Authenticate(room, playerId, token);
            if (_connections.TryGetValue(connectionId, out var attached) &&
                (attached.RoomCode != room.Code || attached.PlayerId != player.Id))
            {
                throw new RoomException("CONNECTION_ALREADY_ATTACHED");
            }
            RemoveConnectionMapping(player);
            player.ConnectionGeneration++;
            player.ConnectionId = connectionId;
            player.DisconnectedAt = null;
            player.DisconnectExpiresAt = null;
            _connections[connectionId] = new PlayerConnection(room.Code, player.Id, player.ConnectionGeneration);
            SetRetroRushPlayerConnected(room, player.Id, true);
            return Snapshot(room);
        }
    }

    public AuthenticatedPlayer AuthenticateConnection(string connectionId)
    {
        if (_connections.TryGetValue(connectionId, out var connection) &&
            _rooms.TryGetValue(connection.RoomCode, out var room))
        {
            lock (room.Gate)
            {
                if (room.Players.TryGetValue(connection.PlayerId, out var player) &&
                    IsCurrentConnection(player, connectionId, connection))
                {
                    return new AuthenticatedPlayer(room.Code, player.Id, player.DisplayName, player.Color);
                }
            }
        }
        throw new RoomException("NOT_ATTACHED");
    }

    public RoomSnapshot BeginGameSelection(string connectionId, IReadOnlyList<string> candidateGameIds)
    {
        var (room, _) = Authorize(connectionId, hostRequired: true);
        lock (room.Gate)
        {
            if (room.Status == RoomPhase.GameSelection) return Snapshot(room);
            OpenGameSelection(room, candidateGameIds);
            return Snapshot(room);
        }
    }

    public RoomSnapshot CastVote(string connectionId, string gameId)
    {
        var (room, player) = Authorize(connectionId, hostRequired: false);
        lock (room.Gate)
        {
            if (room.Status != RoomPhase.GameSelection) return Snapshot(room);
            if (!room.CandidateGameIds.Contains(gameId, StringComparer.Ordinal)) throw new RoomException("INVALID_GAME");
            room.Votes[player.Id] = gameId;
            return Snapshot(room);
        }
    }

    public VoteResolution ResolveVote(string connectionId)
    {
        var (room, _) = Authorize(connectionId, hostRequired: true);
        lock (room.Gate)
        {
            var gameStarted = ResolveVote(room);
            return new VoteResolution(Snapshot(room), gameStarted);
        }
    }

    public RoomSnapshot ReturnToGameSelection(string connectionId)
    {
        var (room, _) = Authorize(connectionId, hostRequired: true);
        lock (room.Gate)
        {
            OpenGameSelection(room, room.CandidateGameIds);
            return Snapshot(room);
        }
    }

    public RoomSnapshot ReturnToLobby(string connectionId)
    {
        var (room, _) = Authorize(connectionId, hostRequired: true);
        lock (room.Gate)
        {
            room.Status = RoomPhase.Lobby;
            room.SelectedGameId = null;
            room.CurrentGameSession = null;
            room.LastSpinResult = null;
            room.SpinBottleState = null;
            room.RussianRouletteState = null;
            room.DrawAndGuessState = null;
            room.Votes.Clear();
            room.VotingStartedAt = null;
            room.VotingEndsAt = null;
            room.TieBreak = null;
            return Snapshot(room);
        }
    }

    public SpinResult Spin(string connectionId)
    {
        var (room, spinner) = Authorize(connectionId, hostRequired: false);
        lock (room.Gate)
        {
            if (room.Status != RoomPhase.Playing || room.CurrentGameSession?.GameId != "spin-the-bottle")
                throw new RoomException("INVALID_ROOM_STATE");
            if (room.SpinBottleState is not null && room.SpinBottleState.Status is not ("IDLE" or "RESOLVED"))
                throw new RoomException("SPIN_ALREADY_ACTIVE");
            var eligible = room.Players.Values.OrderBy(player => player.JoinedAt).Take(6).ToArray();
            if (eligible.Length == 0) throw new RoomException("NO_PLAYERS");
            var targetIndex = roomRandom.Next(eligible.Length);
            var turns = roomRandom.Next(4, 7);
            var previousAngle = room.LastSpinResult?.FinalAngle ?? 0;
            var normalizedAngle = ((previousAngle % 360) + 360) % 360;
            var now = timeProvider.GetUtcNow();
            var spinId = Guid.NewGuid().ToString("N");
            var result = new SpinResult(spinId, room.CurrentGameSession.Id, room.CurrentGameSession.RoundId,
                spinner.Id, eligible[targetIndex].Id, targetIndex,
                previousAngle - normalizedAngle + turns * 360 + targetIndex * 60, 3200, now.ToUnixTimeMilliseconds());
            room.LastSpinResult = result;
            room.SpinBottleState = new SpinBottleState(spinId, spinner.Id, eligible[targetIndex].Id, targetIndex,
                null, null, null, "SPINNING", 1, now.ToUnixTimeMilliseconds(), (now + TimeSpan.FromMilliseconds(result.DurationMs)).ToUnixTimeMilliseconds());
            return result;
        }
    }

    public RoomSnapshot ChooseSpinCategory(string connectionId, string category, int expectedRevision)
    {
        var (room, player) = Authorize(connectionId, hostRequired: false);
        lock (room.Gate)
        {
            var state = AuthorizeSpinAction(room, player, expectedRevision, "CHOICE");
            if (!SpinQuestions.ContainsKey(category)) throw new RoomException("INVALID_QUESTION_CATEGORY");
            state.Category = category;
            SetQuestion(state, exceptQuestionId: null);
            AdvanceSpinState(state, "QUESTION_ACTIVE");
            return Snapshot(room);
        }
    }

    public RoomSnapshot ResetSpinCategory(string connectionId, int expectedRevision)
    {
        var (room, player) = Authorize(connectionId, hostRequired: false);
        lock (room.Gate)
        {
            var state = AuthorizeSpinAction(room, player, expectedRevision, "CONFIRM");
            state.Category = null;
            state.QuestionId = null;
            state.QuestionText = null;
            AdvanceSpinState(state, "CHOICE");
            return Snapshot(room);
        }
    }

    public RoomSnapshot ActivateSpinQuestion(string connectionId, int expectedRevision)
    {
        var (room, player) = Authorize(connectionId, hostRequired: false);
        lock (room.Gate)
        {
            var state = AuthorizeSpinAction(room, player, expectedRevision, "CONFIRM");
            SetQuestion(state, exceptQuestionId: null);
            var now = timeProvider.GetUtcNow();
            AdvanceSpinState(state, "LOADING", (now + _questionLoadingTime).ToUnixTimeMilliseconds());
            return Snapshot(room);
        }
    }

    public RoomSnapshot PassSpinQuestion(string connectionId, string questionId, int expectedRevision)
    {
        var (room, player) = Authorize(connectionId, hostRequired: false);
        lock (room.Gate)
        {
            var state = AuthorizeQuestionAction(room, player, questionId, expectedRevision);
            SetQuestion(state, state.QuestionId);
            AdvanceSpinState(state, "QUESTION_ACTIVE");
            return Snapshot(room);
        }
    }

    public RoomSnapshot CompleteSpinQuestion(string connectionId, string questionId, int expectedRevision)
    {
        var (room, player) = Authorize(connectionId, hostRequired: false);
        lock (room.Gate)
        {
            var state = AuthorizeQuestionAction(room, player, questionId, expectedRevision);
            AdvanceSpinState(state, "RESOLVED");
            return Snapshot(room);
        }
    }

    /// <summary>
    /// The only place the secret word ever crosses the wire to a client —
    /// and only to whoever is actually holding the pencil right now. A
    /// SignalR method's return value goes to the caller alone, never
    /// broadcast, which is exactly the delivery this needs.
    /// </summary>
    public string RequestDrawAndGuessWord(string connectionId)
    {
        var (room, player) = Authorize(connectionId, hostRequired: false);
        lock (room.Gate)
        {
            var state = room.DrawAndGuessState ?? throw new RoomException("NO_ACTIVE_ROUND");
            if (state.DrawerPlayerId != player.Id) throw new RoomException("NOT_DRAWER");
            return state.Word;
        }
    }

    /// <summary>
    /// Only the drawer can give a letter away — as many times as they like,
    /// no per-player limit, since it's their own picture that isn't landing.
    /// Everyone sees the same opened letters; which index opens is random
    /// among the ones still hidden.
    /// </summary>
    public RoomSnapshot RequestDrawAndGuessLetterHint(string connectionId)
    {
        var (room, player) = Authorize(connectionId, hostRequired: false);
        lock (room.Gate)
        {
            var state = room.DrawAndGuessState ?? throw new RoomException("NO_ACTIVE_ROUND");
            if (state.DrawerPlayerId != player.Id) throw new RoomException("NOT_DRAWER");
            var hiddenIndices = Enumerable.Range(0, state.Word.Length)
                .Where(index => !state.RevealedLetterIndices.Contains(index))
                .ToArray();
            if (hiddenIndices.Length == 0) throw new RoomException("ALL_LETTERS_REVEALED");
            state.RevealedLetterIndices.Add(hiddenIndices[roomRandom.Next(hiddenIndices.Length)]);
            state.Revision++;
            state.UpdatedAtUtc = timeProvider.GetUtcNow().ToUnixTimeMilliseconds();
            return Snapshot(room);
        }
    }

    /// <summary>
    /// The drawer never guesses their own word, and a guess only counts once
    /// per player per round — trying again after a correct guess is a no-op
    /// rather than an error, since a slow double-submit is more likely than
    /// someone probing the rule.
    /// </summary>
    public DrawAndGuessGuessResult SubmitDrawAndGuessGuess(string connectionId, string text)
    {
        var (room, player) = Authorize(connectionId, hostRequired: false);
        lock (room.Gate)
        {
            if (room.Status != RoomPhase.Playing || room.CurrentGameSession?.GameId != "draw-and-guess")
                throw new RoomException("INVALID_ROOM_STATE");
            var state = room.DrawAndGuessState ?? throw new RoomException("NO_ACTIVE_ROUND");
            if (state.DrawerPlayerId == player.Id) throw new RoomException("DRAWER_CANNOT_GUESS");
            var trimmed = text.Trim();
            if (trimmed.Length == 0 || trimmed.Length > 60) throw new RoomException("INVALID_GUESS");
            if (state.CorrectGuesserIds.Contains(player.Id))
                return new DrawAndGuessGuessResult(player.Id, player.DisplayName, false, null, trimmed, null);

            var turkish = System.Globalization.CultureInfo.GetCultureInfo("tr-TR");
            var isCorrect = string.Equals(trimmed.ToLower(turkish), state.Word.ToLower(turkish), StringComparison.Ordinal);
            if (!isCorrect) return new DrawAndGuessGuessResult(player.Id, player.DisplayName, false, null, trimmed, null);

            var rank = state.CorrectGuesserIds.Count + 1;
            var points = rank <= DrawAndGuessRankPoints.Length ? DrawAndGuessRankPoints[rank - 1] : DrawAndGuessFallbackPoints;
            state.CorrectGuesserIds.Add(player.Id);
            state.Scores[player.Id] = state.Scores.GetValueOrDefault(player.Id) + points;
            state.Revision++;
            var now = timeProvider.GetUtcNow().ToUnixTimeMilliseconds();
            state.UpdatedAtUtc = now;

            // Çizen dışında herkes bildiyse tur bitmiştir — host'un "Sıradaki
            // tur"a basmasını beklemeden, herkesin son tahmini/kutlamayı
            // görmesi için kısa bir gecikmeyle otomatik ilerlet
            // (AdvanceTimedStates bu alanı okuyup gerçek geçişi yapar).
            var otherPlayerIds = room.Players.Keys.Where(id => id != state.DrawerPlayerId).ToArray();
            if (otherPlayerIds.Length > 0 && otherPlayerIds.All(state.CorrectGuesserIds.Contains))
                state.RoundCompletedAtUtc = now + DrawAndGuessRoundCompleteDelayMs;

            return new DrawAndGuessGuessResult(player.Id, player.DisplayName, true, rank, null, points);
        }
    }

    /// <summary>
    /// Host-only, like moving on in every other game here — a manual
    /// "skip ahead" for when the drawer's picture is hopeless. Everyone
    /// guessing correctly instead advances automatically, via
    /// <see cref="AdvanceTimedStates"/>.
    /// </summary>
    public RoomSnapshot NextDrawAndGuessRound(string connectionId)
    {
        var (room, _) = Authorize(connectionId, hostRequired: true);
        lock (room.Gate)
        {
            _ = room.DrawAndGuessState ?? throw new RoomException("NO_ACTIVE_ROUND");
            AdvanceDrawAndGuessRound(room);
            return Snapshot(room);
        }
    }

    /// <summary>
    /// Pays the outgoing drawer for the round that just ended (nothing if
    /// nobody guessed), then replaces the round with a fresh drawer and
    /// word. Caller must hold <c>room.Gate</c>.
    /// </summary>
    private void AdvanceDrawAndGuessRound(GameRoom room)
    {
        var state = room.DrawAndGuessState!;
        if (state.CorrectGuesserIds.Count > 0)
        {
            var bonus = state.CorrectGuesserIds.Count * DrawAndGuessDrawerPointsPerCorrectGuesser;
            state.Scores[state.DrawerPlayerId] = state.Scores.GetValueOrDefault(state.DrawerPlayerId) + bonus;
        }
        room.DrawAndGuessState = CreateDrawAndGuessState(room, state.Scores);
    }

    /// <summary>
    /// Only the current holder may call this, and only at whoever they name —
    /// never at themselves. The chamber pointer always advances, hit or miss,
    /// so the bullet is guaranteed within one full cylinder's worth of shots
    /// rather than re-rolled fresh (and possibly dodged forever) every time.
    /// </summary>
    public FireResult Fire(string connectionId, string targetPlayerId)
    {
        var (room, player) = Authorize(connectionId, hostRequired: false);
        lock (room.Gate)
        {
            if (room.Status != RoomPhase.Playing || room.CurrentGameSession?.GameId != "rus-ruleti")
                throw new RoomException("INVALID_ROOM_STATE");
            var state = room.RussianRouletteState ?? throw new RoomException("NO_ACTIVE_ROULETTE");
            if (state.HolderPlayerId != player.Id) throw new RoomException("NOT_HOLDER");
            if (state.Status != "IDLE") throw new RoomException("INVALID_ROULETTE_STATE");
            if (targetPlayerId == player.Id) throw new RoomException("CANNOT_TARGET_SELF");
            if (!room.Players.ContainsKey(targetPlayerId)) throw new RoomException("INVALID_TARGET");

            var hit = state.ChamberPointer == state.BulletChamber;
            state.ChamberPointer = (state.ChamberPointer + 1) % state.Chambers;
            var now = timeProvider.GetUtcNow();
            state.LastShooterPlayerId = player.Id;
            state.LastTargetPlayerId = targetPlayerId;
            state.LastShotHit = hit;
            state.Revision++;
            state.UpdatedAtUtc = now.ToUnixTimeMilliseconds();

            if (hit)
            {
                // The index addresses the room-owned 20-question bank. The
                // local text remains an authoritative fallback when AI is unavailable.
                var questionIndex = roomRandom.Next(20);
                state.QuestionId = $"roulette:{questionIndex}";
                state.QuestionText = RouletteQuestions[questionIndex % RouletteQuestions.Length];
                state.Status = "QUESTION_ACTIVE";
            }
            else
            {
                state.QuestionId = null;
                state.QuestionText = null;
                // Nobody is eliminated — the person just shot at simply takes the gun next.
                state.HolderPlayerId = targetPlayerId;
            }

            return new FireResult(room.CurrentGameSession.Id, room.CurrentGameSession.RoundId,
                player.Id, targetPlayerId, hit, now.ToUnixTimeMilliseconds());
        }
    }

    /// <summary>
    /// Only the person who was just shot may complete their own question —
    /// completing it is what hands them the gun and reloads the cylinder in
    /// secret for the next round.
    /// </summary>
    public RoomSnapshot CompleteFireQuestion(string connectionId, int expectedRevision)
    {
        var (room, player) = Authorize(connectionId, hostRequired: false);
        lock (room.Gate)
        {
            var state = room.RussianRouletteState ?? throw new RoomException("NO_ACTIVE_ROULETTE");
            if (state.LastTargetPlayerId != player.Id) throw new RoomException("NOT_QUESTION_OWNER");
            if (state.Revision != expectedRevision) throw new RoomException("STALE_ROULETTE_STATE");
            if (state.Status != "QUESTION_ACTIVE") throw new RoomException("INVALID_ROULETTE_STATE");

            state.HolderPlayerId = player.Id;
            state.BulletChamber = roomRandom.Next(state.Chambers);
            state.ChamberPointer = roomRandom.Next(state.Chambers);
            state.QuestionId = null;
            state.QuestionText = null;
            state.Status = "IDLE";
            state.Revision++;
            state.UpdatedAtUtc = timeProvider.GetUtcNow().ToUnixTimeMilliseconds();
            return Snapshot(room);
        }
    }

    public RoomSnapshot Leave(string connectionId)
    {
        var (room, player) = Authorize(connectionId, hostRequired: false);
        lock (room.Gate)
        {
            RemoveConnectionMapping(player);
            room.Players.Remove(player.Id);
            RemoveRetroRushPlayer(room, player.Id);
            RemoveImposterPlayer(room, player.Id);
            ElectHost(room);
            if (room.Players.Count == 0) _rooms.TryRemove(room.Code, out _);
            return Snapshot(room);
        }
    }

    public RoomSnapshot? Disconnect(string connectionId)
    {
        if (!_connections.TryRemove(connectionId, out var connection) ||
            !_rooms.TryGetValue(connection.RoomCode, out var room))
        {
            return null;
        }

        lock (room.Gate)
        {
            if (!room.Players.TryGetValue(connection.PlayerId, out var player) ||
                !IsCurrentConnection(player, connectionId, connection))
            {
                return null;
            }

            var disconnectedAt = timeProvider.GetUtcNow();
            player.ConnectionId = null;
            player.DisconnectedAt = disconnectedAt;
            player.DisconnectExpiresAt = disconnectedAt + _disconnectGrace;
            SetRetroRushPlayerConnected(room, player.Id, false);
            return Snapshot(room);
        }
    }

    public IReadOnlyList<RoomChange> SweepDisconnected()
    {
        var changes = new List<RoomChange>();
        var now = timeProvider.GetUtcNow();
        foreach (var room in _rooms.Values)
        {
            lock (room.Gate)
            {
                var expired = room.Players.Values
                    .Where(player => player.ConnectionId is null &&
                                     player.DisconnectedAt is not null &&
                                     player.DisconnectExpiresAt is not null &&
                                     player.DisconnectExpiresAt <= now)
                    .Select(player => player.Id).ToArray();
                if (expired.Length == 0) continue;
                foreach (var playerId in expired)
                {
                    RemoveConnectionMapping(room.Players[playerId]);
                    room.Players.Remove(playerId);
                    RemoveRetroRushPlayer(room, playerId);
                    RemoveImposterPlayer(room, playerId);
                }
                ElectHost(room);
                if (room.Players.Count == 0)
                {
                    _rooms.TryRemove(room.Code, out _);
                    changes.Add(new RoomChange(room.Code, room.Id, null));
                }
                else changes.Add(new RoomChange(room.Code, room.Id, Snapshot(room)));
            }
        }
        return changes;
    }

    public IReadOnlyList<TimedRoomChange> AdvanceTimedStates()
    {
        var changes = new List<TimedRoomChange>();
        var now = timeProvider.GetUtcNow().ToUnixTimeMilliseconds();
        foreach (var room in _rooms.Values)
        {
            lock (room.Gate)
            {
                var gameStarted = false;
                var spinStateChanged = false;
                var drawAndGuessStateChanged = false;
                if (room.Status == RoomPhase.GameSelection &&
                    room.VotingEndsAt is { } votingEnd && votingEnd <= now)
                {
                    gameStarted = ResolveVote(room);
                }

                if (room.SpinBottleState?.StateEndsAtUtc is { } stateEnd && stateEnd <= now)
                {
                    if (room.SpinBottleState.Status == "SPINNING")
                    {
                        AdvanceSpinState(room.SpinBottleState, "CHOICE");
                        spinStateChanged = true;
                    }
                    else if (room.SpinBottleState.Status == "LOADING")
                    {
                        AdvanceSpinState(room.SpinBottleState, "QUESTION_ACTIVE");
                        spinStateChanged = true;
                    }
                }

                DrawAndGuessWordReveal? drawAndGuessWordReveal = null;
                if (room.DrawAndGuessState?.RoundCompletedAtUtc is { } roundCompletesAt && roundCompletesAt <= now)
                {
                    // Herkes zaten bildi — kelimeyi ayrıca açıklamaya gerek yok.
                    AdvanceDrawAndGuessRound(room);
                    drawAndGuessStateChanged = true;
                }
                else if (room.DrawAndGuessState is { } timedOutState && timedOutState.RoundEndsAtUtc <= now)
                {
                    // Süre doldu, kimse (ya da herkes) bilemedi — kelimeyi açıklayıp devam et.
                    drawAndGuessWordReveal = new DrawAndGuessWordReveal(timedOutState.Word, timedOutState.Revision);
                    AdvanceDrawAndGuessRound(room);
                    drawAndGuessStateChanged = true;
                }

                if (gameStarted || spinStateChanged || drawAndGuessStateChanged)
                    changes.Add(new TimedRoomChange(room.Code, Snapshot(room), gameStarted, spinStateChanged, drawAndGuessStateChanged, drawAndGuessWordReveal));
            }
        }
        return changes;
    }

    private void OpenGameSelection(GameRoom room, IReadOnlyList<string> candidateGameIds)
    {
        var candidates = candidateGameIds
            .Where(SupportedGames.Contains)
            .Where(gameId => IsGamePlayable(room, gameId))
            .Distinct(StringComparer.Ordinal)
            .ToArray();
        if (candidates.Length == 0)
            candidates = SupportedGames.Where(gameId => IsGamePlayable(room, gameId)).Order(StringComparer.Ordinal).ToArray();

        var now = timeProvider.GetUtcNow().ToUnixTimeMilliseconds();
        room.Status = RoomPhase.GameSelection;
        room.SelectedGameId = null;
        room.CurrentGameSession = null;
        room.LastSpinResult = null;
        room.SpinBottleState = null;
        room.RussianRouletteState = null;
        room.DrawAndGuessState = null;
        room.Votes.Clear();
        room.CandidateGameIds = candidates;
        room.VotingStartedAt = now;
        room.VotingEndsAt = now + room.VotingTimeSeconds * 1000L;
        room.TieBreak = null;
    }

    private bool ResolveVote(GameRoom room)
    {
        if (room.Status != RoomPhase.GameSelection) return false;
        var candidates = room.CandidateGameIds.Where(gameId => IsGamePlayable(room, gameId)).ToArray();
        if (candidates.Length == 0)
            candidates = SupportedGames.Where(gameId => IsGamePlayable(room, gameId)).Order(StringComparer.Ordinal).ToArray();
        if (candidates.Length == 0) return false;
        room.CandidateGameIds = candidates;

        var tally = room.Votes.Values
            .Where(candidates.Contains)
            .GroupBy(gameId => gameId, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.Count(), StringComparer.Ordinal);
        var votedCandidates = candidates.Where(gameId => tally.GetValueOrDefault(gameId) > 0).ToArray();
        var tiedCandidates = votedCandidates.Length == 0
            ? candidates.ToArray()
            : votedCandidates
                .Where(gameId => tally[gameId] == votedCandidates.Max(candidate => tally[candidate]))
                .ToArray();
        var winner = tiedCandidates[roomRandom.Next(tiedCandidates.Length)];

        room.SelectedGameId = winner;
        room.Status = RoomPhase.Playing;
        room.VotingStartedAt = null;
        room.VotingEndsAt = null;
        room.TieBreak = tiedCandidates.Length > 1 ? new TieBreakState(tiedCandidates, winner) : null;
        room.CurrentGameSession = new GameSession(
            Guid.NewGuid().ToString("N"), winner, Guid.NewGuid().ToString("N"),
            RandomNumberGenerator.GetInt32(int.MaxValue), "ACTIVE");
        room.RussianRouletteState = winner == "rus-ruleti" ? CreateRouletteState(room) : null;
        room.DrawAndGuessState = winner == "draw-and-guess" ? CreateDrawAndGuessState(room, previousScores: null) : null;
        if (winner == "retro-rush") InitializeRetroRush(room, room.CurrentGameSession);
        if (winner == "imposter") InitializeImposter(room, room.CurrentGameSession);
        return true;
    }

    private static bool IsGamePlayable(GameRoom room, string gameId) =>
        gameId != "imposter" || room.Players.Count is >= 3 and <= 10;

    /// <summary>
    /// Chamber count is deliberately not equal to the player count (same
    /// independence the client-side prototype had) — it is picked once, here,
    /// and never revealed; only this method and <see cref="Fire"/> /
    /// <see cref="CompleteFireQuestion"/> ever read the bullet position.
    /// </summary>
    private RussianRouletteState CreateRouletteState(GameRoom room)
    {
        var players = room.Players.Values.OrderBy(player => player.JoinedAt).ToArray();
        var holder = players[roomRandom.Next(players.Length)];
        var chambers = Math.Clamp(players.Length + roomRandom.Next(-1, 4), MinChambers, MaxChambers);
        var now = timeProvider.GetUtcNow().ToUnixTimeMilliseconds();
        return new RussianRouletteState(holder.Id, chambers, roomRandom.Next(chambers), roomRandom.Next(chambers), "IDLE", 1, now);
    }

    /// <summary>
    /// <paramref name="previousScores"/> carries the scoreboard across rounds
    /// within the same game — only the very first round of a match starts
    /// from an empty board. The word itself never leaves this method except
    /// through <see cref="RequestDrawAndGuessWord"/>, which checks the caller
    /// really is the drawer before handing it back.
    /// </summary>
    private DrawAndGuessState CreateDrawAndGuessState(GameRoom room, IReadOnlyDictionary<string, int>? previousScores)
    {
        var players = room.Players.Values.OrderBy(player => player.JoinedAt).ToArray();
        var previousDrawerId = room.DrawAndGuessState?.DrawerPlayerId;
        var eligibleDrawers = players.Length > 1 && previousDrawerId is not null
            ? players.Where(player => player.Id != previousDrawerId).ToArray()
            : players;
        var drawer = eligibleDrawers[roomRandom.Next(eligibleDrawers.Length)];
        var previousRecentWords = room.DrawAndGuessState?.RecentWords ?? [];
        var wordPool = DrawAndGuessWords.Where(candidate => !previousRecentWords.Contains(candidate, StringComparer.Ordinal)).ToArray();
        var wordSource = wordPool.Length > 0 ? wordPool : DrawAndGuessWords;
        var word = wordSource[roomRandom.Next(wordSource.Length)];
        var recentWords = previousRecentWords.Append(word).TakeLast(DrawAndGuessRecentWordMemory).ToList();
        var roundNumber = (room.DrawAndGuessState?.RoundNumber ?? 0) + 1;
        var now = timeProvider.GetUtcNow().ToUnixTimeMilliseconds();
        var scores = previousScores is null
            ? new Dictionary<string, int>(StringComparer.Ordinal)
            : new Dictionary<string, int>(previousScores, StringComparer.Ordinal);
        foreach (var player in players) scores.TryAdd(player.Id, 0);
        return new DrawAndGuessState(drawer.Id, word, roundNumber, scores, recentWords, now + DrawAndGuessRoundDurationMs, 1, now);
    }

    private RoomAdmission AddPlayer(GameRoom room, string displayName, string color)
    {
        var token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
        var admittedAt = timeProvider.GetUtcNow();
        var player = new RoomPlayer(Guid.NewGuid().ToString("N"), displayName.Trim(), NormalizeColor(color), HashToken(token),
            admittedAt.ToUnixTimeMilliseconds())
        {
            // HTTP admission happens just before SignalR attachment. If the tab
            // disappears between those two steps, this membership still gets
            // the same reconnect grace instead of living in the room forever.
            DisconnectedAt = admittedAt,
            DisconnectExpiresAt = admittedAt + _disconnectGrace,
        };
        room.Players[player.Id] = player;
        var snapshot = Snapshot(room);
        return new RoomAdmission(room.Code, player.Id, player.DisplayName, player.Id == room.HostPlayerId, token,
            snapshot, PlayerSnapshot(room, player));
    }

    private (GameRoom Room, RoomPlayer Player) Authorize(string connectionId, bool hostRequired)
    {
        if (_connections.TryGetValue(connectionId, out var connection) &&
            _rooms.TryGetValue(connection.RoomCode, out var room))
        {
            lock (room.Gate)
            {
                if (room.Players.TryGetValue(connection.PlayerId, out var player) &&
                    IsCurrentConnection(player, connectionId, connection))
                {
                    if (hostRequired && room.HostPlayerId != player.Id) throw new RoomException("HOST_REQUIRED");
                    return (room, player);
                }
            }
        }
        throw new RoomException("NOT_ATTACHED");
    }

    private void RemoveConnectionMapping(RoomPlayer player)
    {
        if (player.ConnectionId is not { } connectionId ||
            !_connections.TryGetValue(connectionId, out var connection) ||
            connection.PlayerId != player.Id ||
            connection.Generation != player.ConnectionGeneration)
        {
            return;
        }

        _connections.TryRemove(connectionId, out _);
    }

    private static bool IsCurrentConnection(RoomPlayer player, string connectionId, PlayerConnection connection) =>
        player.ConnectionId == connectionId &&
        player.Id == connection.PlayerId &&
        player.ConnectionGeneration == connection.Generation;

    private static RoomPlayer Authenticate(GameRoom room, string playerId, string token)
    {
        if (!room.Players.TryGetValue(playerId, out var player) ||
            !CryptographicOperations.FixedTimeEquals(player.TokenHash, HashToken(token)))
            throw new RoomException("INVALID_CREDENTIALS");
        return player;
    }

    private static void ElectHost(GameRoom room)
    {
        if (room.Players.ContainsKey(room.HostPlayerId)) return;
        room.HostPlayerId = room.Players.Values.OrderBy(player => player.JoinedAt).Select(player => player.Id).FirstOrDefault() ?? "";
    }

    private static SpinBottleState AuthorizeSpinAction(GameRoom room, RoomPlayer player, int expectedRevision, string expectedStatus)
    {
        var state = room.SpinBottleState ?? throw new RoomException("NO_ACTIVE_SPIN");
        if (state.TargetPlayerId != player.Id) throw new RoomException("NOT_QUESTION_OWNER");
        if (state.Revision != expectedRevision) throw new RoomException("STALE_SPIN_STATE");
        if (state.Status != expectedStatus) throw new RoomException("INVALID_SPIN_STATE");
        return state;
    }

    private static SpinBottleState AuthorizeQuestionAction(GameRoom room, RoomPlayer player, string questionId, int expectedRevision)
    {
        var state = AuthorizeSpinAction(room, player, expectedRevision, "QUESTION_ACTIVE");
        if (state.QuestionId != questionId) throw new RoomException("STALE_SPIN_STATE");
        return state;
    }

    private void SetQuestion(SpinBottleState state, string? exceptQuestionId)
    {
        if (state.Category is null || !SpinQuestions.TryGetValue(state.Category, out var questions))
            throw new RoomException("INVALID_QUESTION_CATEGORY");
        var candidateIndexes = Enumerable.Range(0, questions.Length)
            .Where(index => $"{state.Category}:{index}" != exceptQuestionId).ToArray();
        var questionIndex = candidateIndexes[roomRandom.Next(candidateIndexes.Length)];
        state.QuestionId = $"{state.Category}:{questionIndex}";
        state.QuestionText = questions[questionIndex];
    }

    private void AdvanceSpinState(SpinBottleState state, string status, long? stateEndsAtUtc = null)
    {
        state.Status = status;
        state.Revision++;
        state.UpdatedAtUtc = timeProvider.GetUtcNow().ToUnixTimeMilliseconds();
        state.StateEndsAtUtc = stateEndsAtUtc;
    }

    private GameRoom Find(string rawCode)
    {
        var code = Normalize(rawCode);
        return _rooms.TryGetValue(code, out var room) ? room : throw new RoomException("ROOM_NOT_FOUND");
    }

    private static string Normalize(string code) => code.Trim().ToUpperInvariant();
    private static byte[] HashToken(string token) => SHA256.HashData(Encoding.UTF8.GetBytes(token));
    private static string NormalizeColor(string color) => System.Text.RegularExpressions.Regex.IsMatch(color, "^#[0-9A-Fa-f]{6}$") ? color : "#6C5CE7";
    private static void ValidateName(string name)
    {
        if (string.IsNullOrWhiteSpace(name) || name.Trim().Length > 24) throw new RoomException("INVALID_DISPLAY_NAME");
    }

    private static string CreateRoomCode()
    {
        Span<char> result = stackalloc char[6];
        for (var index = 0; index < result.Length; index++) result[index] = Alphabet[RandomNumberGenerator.GetInt32(Alphabet.Length)];
        return new string(result);
    }

    private static RoomSnapshot Snapshot(GameRoom room) => new(
        room.Id, room.Code, room.RoomName, room.HostPlayerId,
        room.Players.Values.OrderBy(player => player.JoinedAt).Select(player => PlayerSnapshot(room, player)).ToArray(),
        room.SelectedGameId, room.Status.ToWire(), room.MaxParticipants, room.QuestionTimeSeconds, room.VotingTimeSeconds,
        new Dictionary<string, string>(room.Votes), room.VotingStartedAt, room.VotingEndsAt,
        room.CandidateGameIds.ToArray(),
        room.TieBreak is null ? null : new TieBreakSnapshot(room.TieBreak.Candidates, room.TieBreak.Winner),
        room.FileName, room.Description, room.CreatedAt,
        room.CurrentGameSession is null ? null : new GameSessionSnapshot(room.CurrentGameSession.Id, room.CurrentGameSession.GameId,
            room.CurrentGameSession.RoundId, room.CurrentGameSession.Seed,
            room.CurrentGameSession.RetroRush?.RoundStartAtUnixMs, room.CurrentGameSession.State),
        room.SpinBottleState is null ? null : new SpinBottleStateSnapshot(room.SpinBottleState.SpinId,
            room.SpinBottleState.SpinnerPlayerId, room.SpinBottleState.TargetPlayerId, room.SpinBottleState.TargetIndex,
            room.SpinBottleState.Category, room.SpinBottleState.QuestionId, room.SpinBottleState.QuestionText,
            room.SpinBottleState.Status, room.SpinBottleState.Revision, room.SpinBottleState.UpdatedAtUtc,
            room.SpinBottleState.StateEndsAtUtc),
        room.RussianRouletteState is null ? null : new RussianRouletteStateSnapshot(
            room.RussianRouletteState.HolderPlayerId, room.RussianRouletteState.Status,
            room.RussianRouletteState.LastShooterPlayerId, room.RussianRouletteState.LastTargetPlayerId,
            room.RussianRouletteState.LastShotHit, room.RussianRouletteState.QuestionId,
            room.RussianRouletteState.QuestionText, room.RussianRouletteState.Revision,
            room.RussianRouletteState.UpdatedAtUtc),
        room.DrawAndGuessState is null ? null : new DrawAndGuessStateSnapshot(
            room.DrawAndGuessState.DrawerPlayerId, room.DrawAndGuessState.RoundNumber,
            room.DrawAndGuessState.CorrectGuesserIds.ToArray(),
            new Dictionary<string, int>(room.DrawAndGuessState.Scores),
            room.DrawAndGuessState.Revision, room.DrawAndGuessState.UpdatedAtUtc,
            room.DrawAndGuessState.RoundEndsAtUtc, room.DrawAndGuessState.Word.Length,
            room.DrawAndGuessState.RevealedLetterIndices.ToDictionary(index => index, index => room.DrawAndGuessState.Word[index])));

    private static RoomPlayerSnapshot PlayerSnapshot(GameRoom room, RoomPlayer player) => new(
        player.Id, player.DisplayName, player.Color, player.Id == room.HostPlayerId, true,
        player.ConnectionId is not null, player.JoinedAt);

    private sealed class GameRoom(string id, string code, string roomName, int maxParticipants,
        int questionTimeSeconds, int votingTimeSeconds, string? fileName, string? description, long createdAt)
    {
        public Lock Gate { get; } = new();
        public string Id { get; } = id;
        public string Code { get; } = code;
        public string RoomName { get; } = roomName;
        public int MaxParticipants { get; } = maxParticipants;
        public int QuestionTimeSeconds { get; } = questionTimeSeconds;
        public int VotingTimeSeconds { get; } = votingTimeSeconds;
        public string? FileName { get; } = fileName;
        public string? Description { get; } = description;
        public long CreatedAt { get; } = createdAt;
        public string HostPlayerId { get; set; } = "";
        public Dictionary<string, RoomPlayer> Players { get; } = new(StringComparer.Ordinal);
        public RoomPhase Status { get; set; } = RoomPhase.Lobby;
        public string? SelectedGameId { get; set; }
        public Dictionary<string, string> Votes { get; } = new(StringComparer.Ordinal);
        public long? VotingStartedAt { get; set; }
        public long? VotingEndsAt { get; set; }
        public IReadOnlyList<string> CandidateGameIds { get; set; } = [];
        public TieBreakState? TieBreak { get; set; }
        public GameSession? CurrentGameSession { get; set; }
        public SpinResult? LastSpinResult { get; set; }
        public SpinBottleState? SpinBottleState { get; set; }
        public RussianRouletteState? RussianRouletteState { get; set; }
        public DrawAndGuessState? DrawAndGuessState { get; set; }
        public AiQuestionSource? AiQuestionSource { get; set; }
    }

    private sealed class RoomPlayer(string id, string displayName, string color, byte[] tokenHash, long joinedAt)
    {
        public string Id { get; } = id;
        public string DisplayName { get; } = displayName;
        public string Color { get; } = color;
        public byte[] TokenHash { get; } = tokenHash;
        public long JoinedAt { get; } = joinedAt;
        public string? ConnectionId { get; set; }
        public long ConnectionGeneration { get; set; }
        public DateTimeOffset? DisconnectedAt { get; set; }
        public DateTimeOffset? DisconnectExpiresAt { get; set; }
    }

    private sealed class GameSession(string id, string gameId, string roundId, int seed, string state)
    {
        public string Id { get; } = id;
        public string GameId { get; } = gameId;
        public string RoundId { get; set; } = roundId;
        public int Seed { get; set; } = seed;
        public string State { get; set; } = state;
        public RetroRushState? RetroRush { get; set; }
        public ImposterState? Imposter { get; set; }
    }

    private sealed record TieBreakState(IReadOnlyList<string> Candidates, string Winner);

    private sealed record AiQuestionSource(
        string? Topic,
        string? ReportText,
        ReportFilePayload? ReportFile,
        string Style);

    private sealed record PlayerConnection(string RoomCode, string PlayerId, long Generation);

    private sealed class SpinBottleState(string spinId, string spinnerPlayerId, string targetPlayerId, int targetIndex,
        string? category, string? questionId, string? questionText, string status, int revision, long updatedAtUtc,
        long? stateEndsAtUtc)
    {
        public string SpinId { get; } = spinId;
        public string SpinnerPlayerId { get; } = spinnerPlayerId;
        public string TargetPlayerId { get; } = targetPlayerId;
        public int TargetIndex { get; } = targetIndex;
        public string? Category { get; set; } = category;
        public string? QuestionId { get; set; } = questionId;
        public string? QuestionText { get; set; } = questionText;
        public string Status { get; set; } = status;
        public int Revision { get; set; } = revision;
        public long UpdatedAtUtc { get; set; } = updatedAtUtc;
        public long? StateEndsAtUtc { get; set; } = stateEndsAtUtc;
    }

    /// <summary>
    /// <see cref="BulletChamber"/> and <see cref="ChamberPointer"/> never leave
    /// this class — <see cref="Snapshot"/> deliberately does not map them.
    /// </summary>
    private sealed class RussianRouletteState(string holderPlayerId, int chambers, int bulletChamber,
        int chamberPointer, string status, int revision, long updatedAtUtc)
    {
        public string HolderPlayerId { get; set; } = holderPlayerId;
        public int Chambers { get; } = chambers;
        public int BulletChamber { get; set; } = bulletChamber;
        public int ChamberPointer { get; set; } = chamberPointer;
        public string? LastShooterPlayerId { get; set; }
        public string? LastTargetPlayerId { get; set; }
        public bool? LastShotHit { get; set; }
        public string? QuestionId { get; set; }
        public string? QuestionText { get; set; }
        public string Status { get; set; } = status;
        public int Revision { get; set; } = revision;
        public long UpdatedAtUtc { get; set; } = updatedAtUtc;
    }

    /// <summary>
    /// <see cref="Word"/> never leaves this class except through
    /// <see cref="RequestDrawAndGuessWord"/>'s caller-only return value —
    /// <see cref="Snapshot"/> deliberately does not map it. Scores persist
    /// across rounds (a new instance replaces this one each round, carrying
    /// the same dictionary forward) so the board reads as a running game,
    /// not a per-round reset.
    /// </summary>
    private sealed class DrawAndGuessState(string drawerPlayerId, string word, int roundNumber,
        Dictionary<string, int> scores, List<string> recentWords, long roundEndsAtUtc, int revision, long updatedAtUtc)
    {
        public string DrawerPlayerId { get; } = drawerPlayerId;
        public string Word { get; } = word;
        public int RoundNumber { get; } = roundNumber;
        public List<string> CorrectGuesserIds { get; } = [];
        public Dictionary<string, int> Scores { get; } = scores;
        /// <summary>Son birkaç turda çıkan kelimeler — <see cref="CreateDrawAndGuessState"/> yeni kelime seçerken bunları eler.</summary>
        public List<string> RecentWords { get; } = recentWords;
        public int Revision { get; set; } = revision;
        public long UpdatedAtUtc { get; set; } = updatedAtUtc;
        /// <summary>Çizen hariç herkes bildiğinde dolar; <see cref="AdvanceTimedStates"/> bu zaman geçince turu otomatik ilerletir.</summary>
        public long? RoundCompletedAtUtc { get; set; }
        /// <summary>Sabit tur süresi doluş anı — kimse (ya da herkes) bilemezse <see cref="AdvanceTimedStates"/> kelimeyi açıklayıp turu ilerletir.</summary>
        public long RoundEndsAtUtc { get; } = roundEndsAtUtc;
        /// <summary>Çizenin açtığı harflerin kelime içindeki index'leri — her yeni turda sıfırdan başlar.</summary>
        public HashSet<int> RevealedLetterIndices { get; } = [];
    }
}

public sealed record AuthenticatedPlayer(string RoomCode, string PlayerId, string DisplayName, string Color);
public sealed record RoomChange(string RoomCode, string RoomInstanceId, RoomSnapshot? Snapshot);
public sealed record VoteResolution(RoomSnapshot Snapshot, bool GameStarted);
public sealed record TimedRoomChange(string RoomCode, RoomSnapshot Snapshot, bool GameStarted, bool SpinStateChanged, bool DrawAndGuessStateChanged, DrawAndGuessWordReveal? DrawAndGuessWordReveal = null);
public sealed class RoomException(string code) : Exception(code) { public string Code { get; } = code; }
internal enum RoomPhase { Lobby, GameSelection, Playing, Closed }
internal static class RoomPhaseExtensions
{
    public static string ToWire(this RoomPhase phase) => phase switch
    {
        RoomPhase.Lobby => "LOBBY",
        RoomPhase.GameSelection => "GAME_SELECTION",
        RoomPhase.Playing => "PLAYING",
        _ => "CLOSED",
    };
}
