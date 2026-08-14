using Retrospective.Server.Contracts;
using Retrospective.Server.Hubs;
using Retrospective.Server.Rooms;

var builder = WebApplication.CreateBuilder(args);
var allowedOrigins = builder.Configuration.GetSection("AllowedOrigins").Get<string[]>() ??
    ["http://localhost:5173", "http://localhost:5174", "http://localhost:5175", "http://localhost:5176"];

builder.Services.Configure<RoomOptions>(builder.Configuration.GetSection("Rooms"));
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<IRoomRandom, CryptographicRoomRandom>();
builder.Services.AddSingleton<RoomManager>();
builder.Services.AddSignalR();
builder.Services.AddHostedService<RoomMaintenanceService>();
builder.Services.AddCors(options => options.AddPolicy("BrowserClients", policy =>
    policy.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod().AllowCredentials()));

var app = builder.Build();
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
