using System.Net.Http.Json;
using System.Text.Json;

namespace Retrospective.Server.Rooms;

public sealed class AiQuestionGateway(HttpClient client, IConfiguration configuration)
{
    private readonly string? _serviceKey = configuration["AiQuestions:InternalServiceKey"];

    public async Task<IResult> Generate(string roomCode, string gameId, Contracts.GenerateRoomQuestionsRequest request, CancellationToken cancellationToken)
    {
        using var message = new HttpRequestMessage(HttpMethod.Post, $"rooms/{Uri.EscapeDataString(roomCode)}/questions")
        {
            Content = JsonContent.Create(new
            {
                gameId,
                topic = string.IsNullOrWhiteSpace(request.Topic) ? "genel retrospektif" : request.Topic.Trim(),
                reportText = string.IsNullOrWhiteSpace(request.ReportText) ? null : request.ReportText.Trim(),
                reportFile = request.ReportFile,
                language = request.Language,
                style = request.Style,
                count = request.Count,
            }),
        };
        AddServiceKey(message);
        return await Forward(message, cancellationToken);
    }

    public Task<IResult> Get(string roomCode, string gameId, CancellationToken cancellationToken) =>
        Forward(Create(HttpMethod.Get,
            $"rooms/{Uri.EscapeDataString(roomCode)}/questions?gameId={Uri.EscapeDataString(gameId)}"), cancellationToken);

    public Task<IResult> Delete(string roomCode, CancellationToken cancellationToken) =>
        Forward(Create(HttpMethod.Delete, $"rooms/{Uri.EscapeDataString(roomCode)}"), cancellationToken);

    public async Task DeleteSilently(string roomCode, CancellationToken cancellationToken)
    {
        try { _ = await Delete(roomCode, cancellationToken); }
        catch { /* Room cleanup must not expose AI provider details or stop maintenance. */ }
    }

    private HttpRequestMessage Create(HttpMethod method, string path)
    {
        var message = new HttpRequestMessage(method, path);
        AddServiceKey(message);
        return message;
    }

    private void AddServiceKey(HttpRequestMessage message)
    {
        if (!string.IsNullOrWhiteSpace(_serviceKey)) message.Headers.Add("X-Internal-Service-Key", _serviceKey);
    }

    private async Task<IResult> Forward(HttpRequestMessage message, CancellationToken cancellationToken)
    {
        try
        {
            using var response = await client.SendAsync(message, cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            JsonElement payload;
            try { payload = JsonSerializer.Deserialize<JsonElement>(body); }
            catch { payload = JsonSerializer.SerializeToElement(new { error = "AI soru servisi geçersiz yanıt verdi." }); }
            return Results.Json(payload, statusCode: (int)response.StatusCode);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return Results.Json(new { error = "AI soru servisi zaman aşımına uğradı." }, statusCode: StatusCodes.Status504GatewayTimeout);
        }
        catch (HttpRequestException)
        {
            return Results.Json(new { error = "AI soru servisine ulaşılamıyor." }, statusCode: StatusCodes.Status503ServiceUnavailable);
        }
    }
}
