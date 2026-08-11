using System.Text.Json;
using System.Text.Json.Serialization;
using RetroPlatform.Api.Hubs;
using RetroPlatform.Api.Rooms;

var builder = WebApplication.CreateBuilder(args);

const string WebCorsPolicy = "web-clients";

// Hosting platforms hand the app a port through PORT and expect it to listen on
// every interface. ASP.NET Core does not read that variable on its own, so
// without this the service starts on the wrong port and the platform's health
// check never passes.
var port = Environment.GetEnvironmentVariable("PORT");
if (!string.IsNullOrWhiteSpace(port))
{
    builder.WebHost.UseUrls($"http://0.0.0.0:{port}");
}

// Origins that may talk to this API. A comma-separated ALLOWED_ORIGINS is the
// shape hosting dashboards make easy; the config array still works locally.
var originsFromEnv = Environment.GetEnvironmentVariable("ALLOWED_ORIGINS")
    ?.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

var allowedOrigins = originsFromEnv is { Length: > 0 }
    ? originsFromEnv
    : builder.Configuration.GetSection("AllowedOrigins").Get<string[]>()
        ?? ["http://localhost:5173", "http://localhost:5174"];

builder.Services.AddCors(options =>
{
    options.AddPolicy(WebCorsPolicy, policy => policy
        .WithOrigins(allowedOrigins)
        .AllowAnyHeader()
        .AllowAnyMethod()
        // Required for SignalR's WebSocket handshake from a browser.
        .AllowCredentials());
});

// camelCase both ways so payloads line up with the TypeScript contracts
// without any renaming on the client.
static void UseCamelCase(JsonSerializerOptions options)
{
    options.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    options.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
}

builder.Services.ConfigureHttpJsonOptions(options => UseCamelCase(options.SerializerOptions));
builder.Services.AddSignalR().AddJsonProtocol(options => UseCamelCase(options.PayloadSerializerOptions));

builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<RoomStore>();
builder.Services.AddSingleton<ReactionPolicy>();
builder.Services.AddHostedService<RoomMaintenanceService>();

var app = builder.Build();

app.UseCors(WebCorsPolicy);

// Lets a deployment health check confirm the service is up.
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

// Read-only lookup so a browser can check a room code before opening a socket.
app.MapGet("/api/rooms/{roomCode}", (string roomCode, RoomStore store) =>
{
    var room = store.Get(roomCode);
    return room is null ? Results.NotFound(new { error = "ROOM_NOT_FOUND" }) : Results.Ok(room);
});

app.MapHub<RoomHub>("/hubs/room");

app.Run();
