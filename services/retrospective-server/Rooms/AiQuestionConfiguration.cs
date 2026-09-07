namespace Retrospective.Server.Rooms;

public sealed record AiQuestionConfiguration(Uri? BaseUrl, string? Error)
{
    public static AiQuestionConfiguration Resolve(string? value, bool isDevelopment)
    {
        if (string.IsNullOrWhiteSpace(value))
            return isDevelopment
                ? new(new Uri("http://localhost:3002/"), null)
                : new(null, "base_url_missing");

        if (!Uri.TryCreate(value.Trim(), UriKind.Absolute, out var uri) ||
            (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps) ||
            !string.IsNullOrEmpty(uri.UserInfo) || !string.IsNullOrEmpty(uri.Query) ||
            !string.IsNullOrEmpty(uri.Fragment))
            return new(null, "base_url_invalid");

        if (!isDevelopment && (uri.IsLoopback || uri.Host.EndsWith(".localhost", StringComparison.OrdinalIgnoreCase)))
            return new(null, "base_url_loopback");

        // Preserve a configured path prefix when HttpClient resolves relative routes.
        return new(new Uri(uri.AbsoluteUri.TrimEnd('/') + "/"), null);
    }
}
