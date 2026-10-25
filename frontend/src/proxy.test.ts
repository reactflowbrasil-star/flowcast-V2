import { proxy } from './proxy';

jest.mock('next/server', () => ({
  NextResponse: {
    next: jest.fn(() => ({ type: 'next' })),
    redirect: jest.fn((url: URL) => ({ type: 'redirect', location: url.toString() }))
  }
}));

import { NextResponse } from 'next/server';

type MiddlewareRequest = {
  nextUrl: { pathname: string };
  cookies: { get: jest.Mock };
  headers: { get: jest.Mock };
  url: string;
};

function createRequest(
  pathname: string,
  options: { token?: string; authorization?: string } = {}
): MiddlewareRequest {
  const { token, authorization } = options;

  return {
    nextUrl: { pathname },
    cookies: {
      get: jest.fn((key: string) => {
        if (key === 'iptv_auth_token' && token) {
          return { value: token };
        }
        return undefined;
      })
    },
    headers: {
      get: jest.fn((key: string) => {
        if (key.toLowerCase() === 'authorization') {
          return authorization ?? null;
        }
        return null;
      })
    },
    url: `https://streamcore.test${pathname}`
  };
}

function createToken(role: string): string {
  const payload = btoa(JSON.stringify({ role }));
  return `header.${payload}.signature`;
}

const mockedNextResponse = NextResponse as unknown as {
  next: jest.Mock;
  redirect: jest.Mock;
};

describe('route middleware guards', () => {
  beforeEach(() => {
    mockedNextResponse.next.mockClear();
    mockedNextResponse.redirect.mockClear();
  });

  it('redirects unauthenticated protected routes to login with redirect param', () => {
    const request = createRequest('/admin/users');
    const response = proxy(request as any);

    expect(response).toEqual(
      expect.objectContaining({
        type: 'redirect'
      })
    );

    const redirectUrl = mockedNextResponse.redirect.mock.calls[0][0] as URL;
    expect(redirectUrl.pathname).toBe('/login');
    expect(redirectUrl.searchParams.get('redirect')).toBe('/admin/users');
  });

  it('allows public login route when no token is present', () => {
    const request = createRequest('/login');
    const response = proxy(request as any);

    expect(response).toEqual({ type: 'next' });
    expect(mockedNextResponse.next).toHaveBeenCalledTimes(1);
  });

  it('redirects authenticated users away from login to their default route', () => {
    const request = createRequest('/login', { token: createToken('admin') });
    const response = proxy(request as any);

    expect(response).toEqual(
      expect.objectContaining({
        type: 'redirect'
      })
    );

    const redirectUrl = mockedNextResponse.redirect.mock.calls[0][0] as URL;
    expect(redirectUrl.pathname).toBe('/admin');
  });

  it('redirects users without required role to their own dashboard', () => {
    const request = createRequest('/admin/content', { token: createToken('end_user') });
    const response = proxy(request as any);

    expect(response).toEqual(
      expect.objectContaining({
        type: 'redirect'
      })
    );

    const redirectUrl = mockedNextResponse.redirect.mock.calls[0][0] as URL;
    expect(redirectUrl.pathname).toBe('/user');
  });

  it('redirects protected route access when token is invalid', () => {
    const request = createRequest('/user/profile', { token: 'invalid-token' });
    const response = proxy(request as any);

    expect(response).toEqual(
      expect.objectContaining({
        type: 'redirect'
      })
    );

    const redirectUrl = mockedNextResponse.redirect.mock.calls[0][0] as URL;
    expect(redirectUrl.pathname).toBe('/login');
    expect(redirectUrl.searchParams.get('redirect')).toBe('/user/profile');
  });
});
