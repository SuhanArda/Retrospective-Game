/**
 * Builds the page's Content-Security-Policy.
 *
 * `connect-src` has to name the room API explicitly — including its WebSocket
 * scheme, which browsers treat separately from http — because the API lives on
 * a different origin to the site. Everything else stays locked to 'self'.
 */
export function buildContentSecurityPolicy(apiUrl: string | undefined): string {
  const connectSources = new Set(["'self'"]);

  if (apiUrl) {
    try {
      const { origin, protocol, host } = new URL(apiUrl);
      connectSources.add(origin);
      connectSources.add(`${protocol === 'https:' ? 'wss' : 'ws'}://${host}`);
    } catch {
      // A malformed URL must not silently widen the policy; leave it at 'self'
      // so the failure shows up as a blocked request rather than a hole.
    }
  }

  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    `connect-src ${[...connectSources].join(' ')}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}
