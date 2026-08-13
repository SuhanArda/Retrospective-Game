using Retrospective.Server.Contracts;
using Retrospective.Server.Hubs;
using Retrospective.Server.Rooms;

var builder = WebApplication.CreateBuilder(args);
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
builder.Services.AddSignalR();
builder.Services.AddHostedService<RoomMaintenanceService>();
builder.Services.AddCors(options => options.AddPolicy("BrowserClients", policy =>
    policy.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod().AllowCredentials()));

var app = builder.Build();
if (!app.Environment.IsDevelopment()) app.UseHsts();
app.UseCors("BrowserClients");
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));
app.MapGet("/api/rooms/{code}", (string code, RoomManager rooms) =>
    rooms.Get(code) is { } room ? Results.Ok(room) : Results.NotFound(new { code = "ROOM_NOT_FOUND" }));
app.MapPost("/api/rooms", (CreateRoomRequest request, RoomManager rooms) => Execute(() =>
{
    var admission = rooms.Create(request);
    return Results.Created($"/api/rooms/{admission.RoomCode}", admission);
}));
app.MapPost("/api/rooms/{code}/join", (string code, JoinRoomRequest request, RoomManager rooms) => Execute(() => Results.Ok(rooms.Join(code, request))));
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

public partial class Program;
