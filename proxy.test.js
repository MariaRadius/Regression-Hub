import { beforeEach, describe, expect, it, vi } from 'vitest';

const getToken = vi.fn();

vi.mock('next-auth/jwt', () => ({
  getToken,
}));

function createProxyRequest(url) {
  const nextUrl = new URL(url);

  return {
    headers: new Headers(),
    nextUrl: {
      pathname: nextUrl.pathname,
      searchParams: nextUrl.searchParams,
      clone: () => new URL(nextUrl.toString()),
    },
    url: nextUrl.toString(),
  };
}

describe('proxy', () => {
  beforeEach(() => {
    vi.resetModules();
    getToken.mockReset();
    process.env.NEXTAUTH_SECRET = 'test-secret';
  });

  it('redirects unauthenticated protected requests to login with reason and full redirect target', async () => {
    getToken.mockResolvedValue(null);
    const { proxy } = await import('./proxy');

    const response = await proxy(
      createProxyRequest('http://localhost:3000/reports?tab=latest'),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/login?redirectTo=%2Freports%3Ftab%3Dlatest&reason=auth-required',
    );
  });

  it('bounces authenticated login visits to the intended in-app destination', async () => {
    getToken.mockResolvedValue({ sub: 'u1', role: 'admin' });
    const { proxy } = await import('./proxy');

    const response = await proxy(
      createProxyRequest(
        'http://localhost:3000/login?redirectTo=%2Freports%3Ftab%3Dlatest',
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/reports?tab=latest',
    );
  });
});
