using System.Net.Http.Json;
using System.Text.Json;

namespace Retrospective.Server.Rooms;

public sealed class AiQuestionGateway(
    HttpClient client,
    IConfiguration configuration,
    ILogger<AiQuestionGateway> logger)
{
    private readonly string? _serviceKey = configuration["AiQuestions:InternalServiceKey"];
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<IResult> Generate(
        string roomCode,
        string roomInstanceId,
        Contracts.GenerateRoomQuestionsRequest request,
        CancellationToken cancellationToken,
        Func<AiRoomQuestionSet, Task>? onReady = null)
    {
        using var message = new HttpRequestMessage(HttpMethod.Post, $"rooms/{Uri.EscapeDataString(roomCode)}/questions")
        {
            Content = JsonContent.Create(new
            {
                roomInstanceId,
                topic = string.IsNullOrWhiteSpace(request.Topic) ? "genel retrospektif" : request.Topic.Trim(),
                reportText = string.IsNullOrWhiteSpace(request.ReportText) ? null : request.ReportText.Trim(),
                reportFile = request.ReportFile,
                language = request.Language,
                style = request.Style,
                count = request.Count,
                replaceExisting = request.ReplaceExisting,
            }),
        };
        AddServiceKey(message);
        return await Forward(message, cancellationToken, "generation", onReady);
    }

    public Task<IResult> Get(
        string roomCode,
        string roomInstanceId,
        CancellationToken cancellationToken,
        Func<AiRoomQuestionSet, Task>? onReady = null) =>
        Forward(Create(HttpMethod.Get,
            $"rooms/{Uri.EscapeDataString(roomCode)}/questions?roomInstanceId={Uri.EscapeDataString(roomInstanceId)}"),
            cancellationToken, "get",
            onReady);

    public Task<IResult> Delete(string roomCode, string roomInstanceId, CancellationToken cancellationToken) =>
        Forward(Create(HttpMethod.Delete,
            $"rooms/{Uri.EscapeDataString(roomCode)}?roomInstanceId={Uri.EscapeDataString(roomInstanceId)}"),
            cancellationToken, "delete");

    public async Task DeleteSilently(string roomCode, string roomInstanceId, CancellationToken cancellationToken)
    {
        try { _ = await Delete(roomCode, roomInstanceId, cancellationToken); }
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

    private async Task<IResult> Forward(
        HttpRequestMessage message,
        CancellationToken cancellationToken,
        string operation,
        Func<AiRoomQuestionSet, Task>? onReady = null)
    {
        var baseUrl = client.BaseAddress?.GetLeftPart(UriPartial.Authority) ?? "unconfigured";
        logger.LogInformation("[AI Gateway] {Operation} requested", operation);
        logger.LogInformation("[AI Gateway] calling ai-bot operation={Operation} baseUrl={BaseUrl}", operation, baseUrl);
        try
        {
            using var response = await client.SendAsync(message, cancellationToken);
            logger.LogInformation(
                "[AI Gateway] ai-bot response operation={Operation} status={StatusCode}",
                operation,
                (int)response.StatusCode);
            if (response.StatusCode is System.Net.HttpStatusCode.Unauthorized or System.Net.HttpStatusCode.Forbidden)
            {
                logger.LogWarning("[AI Gateway] ai-bot authentication rejected; verify matching internal service keys");
            }
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            JsonElement payload;
            try { payload = JsonSerializer.Deserialize<JsonElement>(body); }
            catch
            {
                logger.LogWarning("[AI Gateway] ai-bot returned a non-JSON response operation={Operation}", operation);
                payload = JsonSerializer.SerializeToElement(new { error = "AI soru servisi geçersiz yanıt verdi." });
            }
            if (response.IsSuccessStatusCode && onReady is not null)
            {
                try
                {
                    var set = payload.Deserialize<AiRoomQuestionSet>(JsonOptions);
                    if (set is { GenerationStatus: "ready", Questions.Count: 20 } &&
                        set.Questions.All(question =>
                            !string.IsNullOrWhiteSpace(question.Id) &&
                            !string.IsNullOrWhiteSpace(question.Text) &&
                            !string.IsNullOrWhiteSpace(question.Answer)))
                    {
                        await onReady(set);
                    }
                }
                catch (JsonException)
                {
                    logger.LogWarning("[AI Gateway] successful ai-bot response failed room question-set validation");
                    // Preserve the proxy response, but never cache malformed AI data in room state.
                }
            }
            return Results.Json(payload, statusCode: (int)response.StatusCode);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            logger.LogWarning("[AI Gateway] request failed operation={Operation} reason=timeout", operation);
            return Results.Json(new { error = "AI soru servisi zaman aşımına uğradı." }, statusCode: StatusCodes.Status504GatewayTimeout);
        }
        catch (HttpRequestException error)
        {
            logger.LogWarning(
                "[AI Gateway] request failed operation={Operation} reason=connection_error httpError={HttpError} baseUrl={BaseUrl}",
                operation,
                error.HttpRequestError,
                baseUrl);
            return Results.Json(new { error = "AI soru servisine ulaşılamıyor." }, statusCode: StatusCodes.Status503ServiceUnavailable);
        }
    }
}

public sealed record AiRoomQuestion(
    string Id,
    string Text,
    string Answer,
    string? Category,
    string? GameCategory);

public sealed record AiRoomQuestionSet(
    string RoomId,
    string RoomInstanceId,
    string QuestionSetId,
    string Provider,
    string GenerationStatus,
    IReadOnlyList<AiRoomQuestion> Questions,
    long CreatedAt,
    long UpdatedAt);
