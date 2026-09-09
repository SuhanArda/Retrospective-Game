using Microsoft.AspNetCore.SignalR;
using Retrospective.Server.Contracts;
using Retrospective.Server.Hubs;
using Retrospective.Server.Rooms;
using Retrospective.Server.Rooms.HideSeek;

var builder = WebApplication.CreateBuilder(args);
var renderPort = Environment.GetEnvironmentVariable("PORT");
if (!string.IsNullOrWhiteSpace(renderPort))
{
    if (!int.TryParse(renderPort, out var port) || port is < 1 or > 65535)
    {
        throw new InvalidOperationException("PORT must be an integer between 1 and 65535.");
    }

    builder.WebHost.UseUrls($"http://0.0.0.0:{port}");
}

var allowedOrigins = builder.Configuration.GetSection("AllowedOrigins").Get<string[]>()?
    .Where(origin => !string.IsNullOrWhiteSpace(origin))
    .Distinct(StringComparer.OrdinalIgnoreCase)
    .ToArray() ?? [];

if (allowedOrigins.Length == 0)
{
    throw new InvalidOperationException(
        "No browser origins are configured. Set AllowedOrigins__0 (and subsequent entries) to exact HTTPS origins.");
}

foreach (var origin in allowedOrigins)
{
    if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri) ||
        (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps) ||
        !string.Equals(uri.GetLeftPart(UriPartial.Authority), origin, StringComparison.OrdinalIgnoreCase))
    {
        throw new InvalidOperationException("AllowedOrigins entries must be exact HTTP or HTTPS origins.");
    }
    if (!builder.Environment.IsDevelopment() && uri.Scheme != Uri.UriSchemeHttps)
    {
        throw new InvalidOperationException("AllowedOrigins entries must use HTTPS outside Development.");
    }
}

builder.Services.Configure<RoomOptions>(builder.Configuration.GetSection("Rooms"));
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<IRoomRandom, CryptographicRoomRandom>();
builder.Services.AddSingleton<RoomManager>();
builder.Services.AddSingleton(_ => HideSeekMap.LoadClassic());
builder.Services.AddSingleton<HideSeekManager>();
builder.Services.AddHostedService<HideSeekGameLoopService>();
var aiConfiguration = AiQuestionConfiguration.Resolve(
    builder.Configuration["AiQuestions:BaseUrl"], builder.Environment.IsDevelopment());
builder.Services.AddSingleton(aiConfiguration);
builder.Services.AddOptions<AiQuestionOptions>()
    .Bind(builder.Configuration.GetSection("AiQuestions"))
    .Validate(options => options.ColdStartTimeoutSeconds is >= 1 and <= 300,
        "AiQuestions:ColdStartTimeoutSeconds must be between 1 and 300.")
    .ValidateOnStart();
builder.Services.AddHttpClient(AiBotReadiness.ClientName, (services, client) =>
{
    client.BaseAddress = services.GetRequiredService<AiQuestionConfiguration>().BaseUrl;
    client.Timeout = Timeout.InfiniteTimeSpan; // Each probe and the entire wake have their own deadlines.
    client.MaxResponseContentBufferSize = 64 * 1024;
}).ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false });
builder.Services.AddSingleton<AiBotReadiness>();
builder.Services.AddHttpClient<AiQuestionGateway>((services, client) =>
{
    client.BaseAddress = services.GetRequiredService<AiQuestionConfiguration>().BaseUrl;
    client.Timeout = TimeSpan.FromSeconds(AiQuestionOptions.GenerationTimeoutSeconds);
});
builder.Services.AddSignalR();
builder.Services.AddHostedService<RoomMaintenanceService>();
builder.Services.AddCors(options => options.AddPolicy("BrowserClients", policy =>
    policy.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod().AllowCredentials()));

var app = builder.Build();
var aiLogger = app.Services.GetRequiredService<ILoggerFactory>().CreateLogger("AI.API");
aiLogger.LogInformation(
    "[AI Config] baseUrl={BaseUrl} internalServiceKeyConfigured={InternalServiceKeyConfigured}",
    aiConfiguration.BaseUrl?.GetLeftPart(UriPartial.Authority) ?? "unconfigured",
    !string.IsNullOrWhiteSpace(builder.Configuration["AiQuestions:InternalServiceKey"]));
if (aiConfiguration.Error is { } configurationError)
    aiLogger.LogError("[AI Config] AI requests unavailable reason={Reason}; set AiQuestions__BaseUrl", configurationError);
if (!app.Environment.IsDevelopment() && string.IsNullOrWhiteSpace(builder.Configuration["AiQuestions:InternalServiceKey"]))
    aiLogger.LogError("[AI Config] AI requests unavailable reason=internal_service_key_missing; set AiQuestions__InternalServiceKey");
if (!app.Environment.IsDevelopment()) app.UseHsts();
app.UseCors("BrowserClients");
app.Use(async (context, next) =>
{
    if (!HttpMethods.IsPost(context.Request.Method) ||
        !context.Request.Path.StartsWithSegments("/api/rooms") ||
        context.Request.Path.Value?.EndsWith("/ai/questions", StringComparison.Ordinal) != true)
    {
        await next(context);
        return;
    }
    // Runs before DTO binding, so malformed JSON and oversized bodies are visible too.
    aiLogger.LogInformation("[AI API] HTTP request received route=/api/rooms/:code/ai/questions");
    context.Response.OnCompleted(() =>
    {
        aiLogger.LogInformation("[AI API] HTTP response status={StatusCode}", context.Response.StatusCode);
        return Task.CompletedTask;
    });
    await next(context);
});
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));
app.MapGet("/api/rooms/{code}", (string code, RoomManager rooms) =>
    rooms.Get(code) is { } room ? Results.Ok(room) : Results.NotFound(new { code = "ROOM_NOT_FOUND" }));
app.MapPost("/api/rooms", (CreateRoomRequest request, RoomManager rooms) => Execute(() =>
{
    var admission = rooms.Create(request);
    return Results.Created($"/api/rooms/{admission.RoomCode}", admission);
}));
app.MapPost("/api/rooms/{code}/join", (string code, JoinRoomRequest request, RoomManager rooms) => Execute(() => Results.Ok(rooms.Join(code, request))));
app.MapPost("/api/ai/warmup", async (AiQuestionGateway ai) =>
{
    aiLogger.LogInformation("[AI Warmup] requested");
    // The browser fires this only after submitting a room with AI source input.
    // It must survive that browser navigating away, hence no request token.
    await ai.WarmUp(CancellationToken.None);
    return Results.Ok(new { warming = true });
});
app.MapPost("/api/rooms/{code}/ai/questions", async (string code, GenerateRoomQuestionsRequest body, HttpRequest request, RoomManager rooms, AiQuestionGateway ai, IHubContext<RoomHub, IRoomClient> clients, CancellationToken cancellationToken) =>
{
    aiLogger.LogInformation("[AI API] request received roomCode={RoomCode} topicProvided={TopicProvided}", code, !string.IsNullOrWhiteSpace(body.Topic));
    try
    {
        var access = AuthorizeAiRequest(request, rooms, code, hostRequired: true);
        var roomRequest = rooms.RememberOrRestoreAiQuestionSource(access.RoomCode, body);
        aiLogger.LogInformation("[AI API] invoking AiQuestionGateway roomCode={RoomCode}", access.RoomCode);
        // The browser immediately navigates to the selected game. Once the
        // request body has arrived, finish generation even if that navigation
        // closes the original HTTP connection.
        return await ai.Generate(
            access.RoomCode,
            access.RoomInstanceId,
            roomRequest,
            CancellationToken.None,
            set => RememberAiQuestionSet(access.RoomCode, access.RoomInstanceId, set, rooms, clients, aiLogger));
    }
    catch (RoomException error)
    {
        aiLogger.LogWarning("[AI API] request rejected roomCode={RoomCode} reason={Reason}", code, error.Code);
        return RoomError(error);
    }
});
app.MapGet("/api/rooms/{code}/ai/questions", async (string code, HttpRequest request, RoomManager rooms, AiQuestionGateway ai, IHubContext<RoomHub, IRoomClient> clients, CancellationToken cancellationToken) =>
{
    try
    {
        var access = AuthorizeAiRequest(request, rooms, code, hostRequired: false);
        // Guests and games may check for questions even when preparation was skipped.
        // Keep that check local so it cannot wake a sleeping AI service.
        if (!rooms.HasAiQuestionSource(access.RoomCode)) return Results.NoContent();
        return await ai.Get(
            access.RoomCode,
            access.RoomInstanceId,
            cancellationToken,
            set => RememberAiQuestionSet(access.RoomCode, access.RoomInstanceId, set, rooms, clients, aiLogger));
    }
    catch (RoomException error) { return RoomError(error); }
});
app.MapHub<RoomHub>("/hubs/room");
app.Run();

static IResult Execute(Func<IResult> operation)
{
    try { return operation(); }
    catch (RoomException error)
    {
        return error.Code switch
        {
            "ROOM_NOT_FOUND" => Results.NotFound(new { code = error.Code }),
            "ROOM_FULL" or "ROOM_ALREADY_STARTED" => Results.Conflict(new { code = error.Code }),
            _ => Results.BadRequest(new { code = error.Code }),
        };
    }
}

static async Task RememberAiQuestionSet(
    string roomCode,
    string roomInstanceId,
    AiRoomQuestionSet questionSet,
    RoomManager rooms,
    IHubContext<RoomHub, IRoomClient> clients,
    ILogger logger)
{
    if (!rooms.TryRememberAiQuestionSet(roomCode, roomInstanceId, questionSet))
    {
        logger.LogInformation("[AI API] question set not cached roomCode={RoomCode} reason=fallback_or_stale_room", roomCode);
        return;
    }
    logger.LogInformation("[AI API] question generation ready roomCode={RoomCode} count={Count}", roomCode, questionSet.Questions.Count);
    if (rooms.RefreshWaitingImposterQuestionPack(roomCode, roomInstanceId) is not { } mutation) return;
    await clients.Clients.Group(RoomHub.GroupName(mutation.RoomCode)).ImposterStateChanged(mutation.Event);
}

static RoomAiAccess AuthorizeAiRequest(HttpRequest request, RoomManager rooms, string code, bool hostRequired)
{
    var playerId = request.Headers["X-Player-Id"].ToString();
    var token = request.Headers["X-Reconnect-Token"].ToString();
    if (string.IsNullOrWhiteSpace(playerId) || string.IsNullOrWhiteSpace(token)) throw new RoomException("INVALID_CREDENTIALS");
    return rooms.AuthorizeAiAccess(code, playerId, token, hostRequired);
}

static IResult RoomError(RoomException error) => error.Code switch
{
    "ROOM_NOT_FOUND" => Results.NotFound(new { code = error.Code }),
    "HOST_REQUIRED" => Results.StatusCode(StatusCodes.Status403Forbidden),
    "INVALID_CREDENTIALS" => Results.Unauthorized(),
    _ => Results.BadRequest(new { code = error.Code }),
};

public partial class Program;
