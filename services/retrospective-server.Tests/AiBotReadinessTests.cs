using System.Diagnostics;
using System.Net;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Retrospective.Server.Contracts;
using Retrospective.Server.Rooms;

namespace Retrospective.Server.Tests;

public sealed class AiBotReadinessTests
{
    [Fact]
    public async Task AwakeServiceReceivesOneAuthenticatedGenerationAfterPublicHealth()
    {
        var handler = new ScenarioHandler();
        var result = await Gateway(handler, Readiness(handler)).Generate("ABC234", "instance", Request(), default);
        Assert.Equal(201, Status(result));
        Assert.Equal(["GET /health", "POST /rooms/ABC234/questions"], handler.Routes);
        Assert.Equal(1, handler.Posts);
    }

    [Theory]
    [InlineData(400)]
    [InlineData(401)]
    [InlineData(403)]
    [InlineData(404)]
    public async Task PermanentHealthFailuresFailImmediatelyWithoutGeneration(int status)
    {
        var handler = new ScenarioHandler { Health = (_, _) => Task.FromResult(Response(status)) };
        var result = await Gateway(handler, Readiness(handler)).Generate("ABC234", "instance", Request(), default);
        Assert.Equal(status, Status(result));
        Assert.Equal(1, handler.HealthCalls);
        Assert.Equal(0, handler.Posts);
    }

    [Theory]
    [InlineData(502)]
    [InlineData(503)]
    [InlineData(504)]
    [InlineData(408)]
    public async Task TransientHealthStatusIsRetriedThenGenerationIsSentOnce(int status)
    {
        var handler = new ScenarioHandler { Health = (attempt, _) => Task.FromResult(attempt == 1 ? Response(status) : Healthy()) };
        var result = await Gateway(handler, Readiness(handler)).Generate("ABC234", "instance", Request(), default);
        Assert.Equal(201, Status(result));
        Assert.Equal(2, handler.HealthCalls);
        Assert.Equal(1, handler.Posts);
    }

    [Fact]
    public async Task RenderLoadingPageDoesNotCountAsReadiness()
    {
        var handler = new ScenarioHandler { Health = (attempt, _) => Task.FromResult(attempt == 1 ? Response(200, "<html>Loading</html>") : Healthy()) };
        Assert.True((await Readiness(handler).WaitUntilReady(default)).Ready);
        Assert.Equal(2, handler.HealthCalls);
    }

    [Fact]
    public async Task UnavailableServiceStopsAtDeadlineAndDoesNotSendGeneration()
    {
        var handler = new ScenarioHandler { Health = (_, _) => throw new HttpRequestException(HttpRequestError.ConnectionError) };
        var elapsed = Stopwatch.StartNew();
        var result = await Gateway(handler, Readiness(handler, 1)).Generate("ABC234", "instance", Request(), default);
        Assert.Equal(504, Status(result));
        Assert.InRange(elapsed.Elapsed.TotalSeconds, 0.8, 4);
        Assert.Equal(1, handler.HealthCalls);
        Assert.Equal(0, handler.Posts);
    }

    [Fact]
    public async Task HangingHealthResponseIsCancelledByTheOverallBudget()
    {
        var handler = new ScenarioHandler { Health = async (_, token) => { await Task.Delay(Timeout.Infinite, token); return Healthy(); } };
        var result = await Readiness(handler, 1).WaitUntilReady(default);
        Assert.False(result.Ready);
        Assert.Equal("cold_start_timeout", result.Reason);
        Assert.Equal(1, handler.HealthCalls);
    }

    [Theory]
    [InlineData(HttpRequestError.ConnectionError)]
    [InlineData(HttpRequestError.NameResolutionError)]
    [InlineData(HttpRequestError.ResponseEnded)]
    public async Task TemporaryNetworkFailureIsRetried(HttpRequestError error)
    {
        var handler = new ScenarioHandler { Health = (attempt, _) => attempt == 1 ? throw new HttpRequestException(error) : Task.FromResult(Healthy()) };
        Assert.True((await Readiness(handler).WaitUntilReady(default)).Ready);
        Assert.Equal(2, handler.HealthCalls);
    }

    [Fact]
    public async Task TlsConfigurationFailureIsNotRetried()
    {
        var handler = new ScenarioHandler { Health = (_, _) => throw new HttpRequestException(HttpRequestError.SecureConnectionError) };
        Assert.False((await Readiness(handler).WaitUntilReady(default)).Ready);
        Assert.Equal(1, handler.HealthCalls);
    }

    [Theory]
    [InlineData(401)]
    [InlineData(404)]
    [InlineData(503)]
    [InlineData(504)]
    public async Task GenerationFailureNeverCausesASecondPost(int status)
    {
        var handler = new ScenarioHandler { Post = _ => Task.FromResult(Response(status)) };
        Assert.Equal(status, Status(await Gateway(handler, Readiness(handler)).Generate("ABC234", "instance", Request(), default)));
        Assert.Equal(1, handler.Posts);
        Assert.Equal(1, handler.HealthCalls);
    }

    [Fact]
    public async Task AmbiguousGenerationTimeoutIsNotRetried()
    {
        var handler = new ScenarioHandler { Post = _ => throw new TaskCanceledException() };
        Assert.Equal(504, Status(await Gateway(handler, Readiness(handler)).Generate("ABC234", "instance", Request(), default)));
        Assert.Equal(1, handler.Posts);
    }

    [Fact]
    public async Task ConcurrentRoomsShareOneWakeAndOneCancelledWaiterDoesNotCancelOthers()
    {
        var health = new TaskCompletionSource<HttpResponseMessage>(TaskCreationOptions.RunContinuationsAsynchronously);
        var handler = new ScenarioHandler { Health = (_, token) => health.Task.WaitAsync(token) };
        var readiness = Readiness(handler);
        using var cancelled = new CancellationTokenSource();
        var leaving = readiness.WaitUntilReady(cancelled.Token);
        var rooms = Enumerable.Range(0, 8).Select(i => Gateway(handler, readiness).Generate($"ABC23{i}", "instance", Request(), default)).ToArray();
        Assert.Equal(1, handler.HealthCalls);
        Assert.Equal(0, handler.Posts);
        cancelled.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => leaving);
        health.SetResult(Healthy());
        var results = await Task.WhenAll(rooms);
        Assert.All(results, result => Assert.Equal(201, Status(result)));
        Assert.Equal(1, handler.HealthCalls);
        Assert.Equal(8, handler.Posts);
    }

    [Fact]
    public async Task LaterGenerationChecksHealthAgainInsteadOfCachingReadinessForever()
    {
        var handler = new ScenarioHandler();
        var readiness = Readiness(handler);
        Assert.True((await readiness.WaitUntilReady(default)).Ready);
        Assert.True((await readiness.WaitUntilReady(default)).Ready);
        Assert.Equal(2, handler.HealthCalls);
    }

    private static int? Status(IResult result) => Assert.IsAssignableFrom<IStatusCodeHttpResult>(result).StatusCode;
    private static GenerateRoomQuestionsRequest Request() => new("Sprint retrospective", null, "tr", "dengeli");
    private static HttpResponseMessage Healthy() => Response(200, "{\"status\":\"ok\"}");
    private static HttpResponseMessage Response(int status, string body = "{}") => new((HttpStatusCode)status) { Content = new StringContent(body) };
    private static AiBotReadiness Readiness(ScenarioHandler handler, int budget = 5) => new(
        new ReadinessClientFactory(handler), Options.Create(new AiQuestionOptions { ColdStartTimeoutSeconds = budget }),
        new ReadinessTestLifetime(), NullLogger<AiBotReadiness>.Instance);
    private static AiQuestionGateway Gateway(ScenarioHandler handler, AiBotReadiness readiness) => new(
        new HttpClient(handler, disposeHandler: false) { BaseAddress = new Uri("https://bot.example/") },
        new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["AiQuestions:InternalServiceKey"] = "shared-test-key" }).Build(),
        NullLogger<AiQuestionGateway>.Instance, AiQuestionConfiguration.Resolve("https://bot.example", false), new ProductionEnvironment(), readiness);

    private sealed class ScenarioHandler : HttpMessageHandler
    {
        public Func<int, CancellationToken, Task<HttpResponseMessage>> Health { get; init; } = (_, _) => Task.FromResult(Healthy());
        public Func<CancellationToken, Task<HttpResponseMessage>> Post { get; init; } = _ => Task.FromResult(Response(201));
        public readonly System.Collections.Concurrent.ConcurrentQueue<string> Routes = new();
        public int HealthCalls;
        public int Posts;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token)
        {
            Routes.Enqueue($"{request.Method} {request.RequestUri!.AbsolutePath}");
            if (request.Method == HttpMethod.Get)
            {
                Assert.False(request.Headers.Contains("X-Internal-Service-Key"));
                return Health(Interlocked.Increment(ref HealthCalls), token);
            }
            Assert.Equal("shared-test-key", request.Headers.GetValues("X-Internal-Service-Key").Single());
            Interlocked.Increment(ref Posts);
            return Post(token);
        }
    }
    private sealed class ProductionEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = Environments.Production;
        public string ApplicationName { get; set; } = "ReadinessTests";
        public string ContentRootPath { get; set; } = ".";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}

internal sealed class ReadinessClientFactory(HttpMessageHandler handler, Uri? baseUrl = null) : IHttpClientFactory
{
    public HttpClient CreateClient(string name) => new(handler, disposeHandler: false)
    { BaseAddress = baseUrl ?? new Uri("https://bot.example/"), Timeout = Timeout.InfiniteTimeSpan };
}
internal sealed class ReadinessTestLifetime : IHostApplicationLifetime
{
    public CancellationToken ApplicationStarted => CancellationToken.None;
    public CancellationToken ApplicationStopping => CancellationToken.None;
    public CancellationToken ApplicationStopped => CancellationToken.None;
    public void StopApplication() { }
}
