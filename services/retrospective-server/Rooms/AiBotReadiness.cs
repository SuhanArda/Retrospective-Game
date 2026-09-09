using System.Diagnostics;
using System.Net;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace Retrospective.Server.Rooms;

public sealed record AiBotReadinessResult(bool Ready, int StatusCode, string Reason);

/// <summary>One on-demand wake task per backend process; never retries generation.</summary>
public sealed class AiBotReadiness(
    IHttpClientFactory clients,
    IOptions<AiQuestionOptions> options,
    IHostApplicationLifetime lifetime,
    ILogger<AiBotReadiness> logger)
{
    public const string ClientName = "AiBotReadiness";
    private readonly object _gate = new();
    private Task<AiBotReadinessResult>? _wakeTask;

    public Task<AiBotReadinessResult> WaitUntilReady(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        Task<AiBotReadinessResult> task;
        lock (_gate)
        {
            // Completed tasks are not cached: the bot may have slept since the last room.
            if (_wakeTask is null || _wakeTask.IsCompleted) _wakeTask = CheckReadiness();
            task = _wakeTask;
        }
        // One caller leaving must not cancel readiness for other rooms.
        return task.WaitAsync(cancellationToken);
    }

    private async Task<AiBotReadinessResult> CheckReadiness()
    {
        var budget = options.Value.ColdStartTimeoutSeconds;
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(lifetime.ApplicationStopping);
        deadline.CancelAfter(TimeSpan.FromSeconds(budget));
        using var client = clients.CreateClient(ClientName);
        var elapsed = Stopwatch.StartNew();
        var delaySeconds = AiQuestionOptions.InitialReadinessDelaySeconds;
        var waitingLogged = false;
        logger.LogInformation("[AI Gateway] ai-bot readiness check started timeoutSeconds={TimeoutSeconds}", budget);
        try
        {
            while (true)
            {
                deadline.Token.ThrowIfCancellationRequested();
                using var probe = CancellationTokenSource.CreateLinkedTokenSource(deadline.Token);
                probe.CancelAfter(TimeSpan.FromSeconds(AiQuestionOptions.HealthProbeTimeoutSeconds));
                string reason;
                try
                {
                    // /health is public and minimal; do not send the internal key here.
                    using var response = await client.GetAsync("health", probe.Token);
                    if (response.StatusCode == HttpStatusCode.OK)
                    {
                        try
                        {
                            using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(probe.Token));
                            if (json.RootElement.ValueKind == JsonValueKind.Object &&
                                json.RootElement.TryGetProperty("status", out var status) &&
                                status.ValueKind == JsonValueKind.String && status.GetString() == "ok")
                            {
                                logger.LogInformation("[AI Gateway] ai-bot ready after {ElapsedSeconds:F1}s", elapsed.Elapsed.TotalSeconds);
                                return new(true, 200, "ready");
                            }
                        }
                        catch (JsonException) { /* A Render loading page is not Node readiness. */ }
                        reason = "unexpected_health_response";
                    }
                    else if (response.StatusCode is HttpStatusCode.RequestTimeout or HttpStatusCode.BadGateway or
                             HttpStatusCode.ServiceUnavailable or HttpStatusCode.GatewayTimeout)
                    {
                        reason = $"http_{(int)response.StatusCode}";
                    }
                    else
                    {
                        logger.LogWarning("[AI Gateway] readiness failed immediately status={StatusCode} reason=health_endpoint_rejected", (int)response.StatusCode);
                        return new(false, (int)response.StatusCode >= 400 ? (int)response.StatusCode : 502, "health_endpoint_rejected");
                    }
                }
                catch (OperationCanceledException) when (!deadline.IsCancellationRequested)
                {
                    reason = "health_probe_timeout";
                }
                catch (HttpRequestException error) when (error.HttpRequestError is HttpRequestError.Unknown or
                    HttpRequestError.NameResolutionError or HttpRequestError.ConnectionError or HttpRequestError.ResponseEnded)
                {
                    reason = "temporary_network_failure";
                }
                catch (HttpRequestException error)
                {
                    logger.LogWarning("[AI Gateway] readiness failed immediately reason={HttpError}", error.HttpRequestError);
                    return new(false, 502, "health_transport_configuration");
                }
                if (!waitingLogged)
                {
                    logger.LogInformation("[AI Gateway] ai-bot not ready; waiting for cold start reason={Reason}", reason);
                    waitingLogged = true;
                }
                await Task.Delay(TimeSpan.FromSeconds(delaySeconds), deadline.Token);
                delaySeconds = Math.Min(delaySeconds * 2, AiQuestionOptions.MaximumReadinessDelaySeconds);
            }
        }
        catch (OperationCanceledException) when (!lifetime.ApplicationStopping.IsCancellationRequested)
        {
            logger.LogWarning("[AI Gateway] ai-bot did not become ready within {TimeoutSeconds}s", budget);
            return new(false, 504, "cold_start_timeout");
        }
    }
}
