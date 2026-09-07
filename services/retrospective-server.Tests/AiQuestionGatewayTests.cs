using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Retrospective.Server.Contracts;
using Retrospective.Server.Rooms;

namespace Retrospective.Server.Tests;

public sealed class AiQuestionGatewayTests
{
    [Theory]
    [InlineData(null, "base_url_missing")]
    [InlineData(" ", "base_url_missing")]
    [InlineData("localhost:3002", "base_url_invalid")]
    [InlineData("http://localhost:3002/", "base_url_loopback")]
    [InlineData("https://127.0.0.1/", "base_url_loopback")]
    [InlineData("http://[::1]:3002/", "base_url_loopback")]
    [InlineData("https://user:secret@bot.example/", "base_url_invalid")]
    [InlineData("https://bot.example/?key=secret", "base_url_invalid")]
    public async Task BadProductionConfigurationNeverSendsHttp(string? url, string expectedError)
    {
        var config = AiQuestionConfiguration.Resolve(url, false);
        Assert.Equal(expectedError, config.Error);
        var handler = new RecordingHandler();
        var result = await Gateway(config, handler).Generate("ABC234", "instance", Request(null), default);
        Assert.Equal(503, Assert.IsAssignableFrom<IStatusCodeHttpResult>(result).StatusCode);
        Assert.Equal(0, handler.Calls);
    }

    [Fact]
    public void OnlyDevelopmentDefaultsToLocalhost()
    {
        Assert.Equal("http://localhost:3002/", AiQuestionConfiguration.Resolve(null, true).BaseUrl?.AbsoluteUri);
    }

    [Fact]
    public async Task MissingProductionKeyNeverSendsHttp()
    {
        var handler = new RecordingHandler();
        var result = await Gateway(AiQuestionConfiguration.Resolve("https://bot.example", false), handler, null)
            .Generate("ABC234", "instance", Request(null), default);
        Assert.Equal(503, Assert.IsAssignableFrom<IStatusCodeHttpResult>(result).StatusCode);
        Assert.Equal(0, handler.Calls);
    }

    [Theory]
    [InlineData(null, "genel retrospektif")]
    [InlineData("   ", "genel retrospektif")]
    [InlineData(" Sprint iletişimi ve geliştirme alanları ", "Sprint iletişimi ve geliştirme alanları")]
    public async Task GatewayPreservesTopicRouteAndAuthentication(string? topic, string expectedTopic)
    {
        var handler = new RecordingHandler();
        var result = await Gateway(AiQuestionConfiguration.Resolve("https://bot.example/prefix", false), handler)
            .Generate("ABC234", "instance", Request(topic), default);
        Assert.Equal(201, Assert.IsAssignableFrom<IStatusCodeHttpResult>(result).StatusCode);
        Assert.Equal("https://bot.example/prefix/rooms/ABC234/questions", handler.Uri?.AbsoluteUri);
        Assert.Equal("test-key", handler.Key);
        using var body = JsonDocument.Parse(handler.Body!);
        Assert.Equal(expectedTopic, body.RootElement.GetProperty("topic").GetString());
        Assert.Equal("instance", body.RootElement.GetProperty("roomInstanceId").GetString());
        Assert.Equal(20, body.RootElement.GetProperty("count").GetInt32());
    }

    private static GenerateRoomQuestionsRequest Request(string? topic) => new(topic, null, "tr", "dengeli");

    private static AiQuestionGateway Gateway(AiQuestionConfiguration config, RecordingHandler handler, string? key = "test-key") =>
        new(new HttpClient(handler) { BaseAddress = config.BaseUrl },
            new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["AiQuestions:InternalServiceKey"] = key }).Build(),
            NullLogger<AiQuestionGateway>.Instance, config, new TestEnvironment(),
            new AiBotReadiness(new ReadinessClientFactory(handler, config.BaseUrl),
                Options.Create(new AiQuestionOptions()), new ReadinessTestLifetime(), NullLogger<AiBotReadiness>.Instance));

    private sealed class RecordingHandler : HttpMessageHandler
    {
        public int Calls { get; private set; }
        public Uri? Uri { get; private set; }
        public string? Key { get; private set; }
        public string? Body { get; private set; }
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            if (request.Method == HttpMethod.Get)
                return new(HttpStatusCode.OK) { Content = new StringContent("{\"status\":\"ok\"}") };
            Calls++;
            Uri = request.RequestUri;
            Key = request.Headers.GetValues("X-Internal-Service-Key").Single();
            Body = await request.Content!.ReadAsStringAsync(cancellationToken);
            return new(HttpStatusCode.Created) { Content = new StringContent("{}") };
        }
    }

    private sealed class TestEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = Environments.Production;
        public string ApplicationName { get; set; } = "GatewayTests";
        public string ContentRootPath { get; set; } = ".";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
