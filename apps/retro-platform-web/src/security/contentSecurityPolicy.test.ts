import { describe, expect, it } from 'vitest';
import { buildContentSecurityPolicy } from './contentSecurityPolicy';

function connectSrc(policy: string): string {
  return policy.split('; ').find((directive) => directive.startsWith('connect-src')) ?? '';
}

describe('buildContentSecurityPolicy', () => {
  it('allows only self when no API is configured', () => {
    expect(connectSrc(buildContentSecurityPolicy(undefined))).toBe("connect-src 'self'");
  });

  it('allows the API origin and its websocket scheme', () => {
    const policy = buildContentSecurityPolicy('http://localhost:5280');
    expect(connectSrc(policy)).toBe("connect-src 'self' http://localhost:5280 ws://localhost:5280");
  });

  it('allows the question bot origin without opening a websocket origin', () => {
    const policy = buildContentSecurityPolicy('http://localhost:5281', 'http://localhost:3002/api');
    expect(connectSrc(policy)).toBe(
      "connect-src 'self' http://localhost:5281 ws://localhost:5281 http://localhost:3002",
    );
  });

  it('uses wss for an https API', () => {
    const policy = buildContentSecurityPolicy('https://api.example.com');
    expect(connectSrc(policy)).toContain('wss://api.example.com');
    expect(connectSrc(policy)).not.toContain('ws://api.example.com');
  });

  it('ignores a path on the configured URL', () => {
    const policy = buildContentSecurityPolicy('https://api.example.com/base/');
    expect(connectSrc(policy)).toBe("connect-src 'self' https://api.example.com wss://api.example.com");
  });

  it('does not widen the policy when the URL is malformed', () => {
    expect(connectSrc(buildContentSecurityPolicy('not a url'))).toBe("connect-src 'self'");
  });

  it('keeps everything else locked down', () => {
    const policy = buildContentSecurityPolicy('http://localhost:5280');
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("script-src 'self'");
    expect(policy).toContain("object-src 'none'");
  });
});
