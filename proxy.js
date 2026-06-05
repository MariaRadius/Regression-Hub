import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import {
  buildLoginRedirectTarget,
  getSafeRedirectTarget,
} from '@/lib/authRedirects';

/**
 * Authentication proxy — the single point of truth for route access control.
 *
 * Scope (this file): AUTHENTICATION — is there a valid, unexpired JWT?
 *
 * Out of scope (do NOT add here):
 *   - Role checks  → app/(app)/**\/page.js  via getServerSession(authOptions)
 *   - Team checks  → lib/server/withTeam.js via getServerSession(authOptions)
 *   - DB lookups   → wrong layer, too slow
 *
 * JWT claims (teamId, role, username) are forwarded as x-user-* request
 * headers so downstream code can read them without re-decoding the token.
 * Downstream callers still use getServerSession for the full session object;
 * these headers are additive, not a replacement.
 */
export async function proxy(req) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const { pathname, searchParams } = req.nextUrl;

  // Unauthenticated
  if (!token) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (pathname !== '/login') {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = '/login';
      loginUrl.searchParams.set(
        'redirectTo',
        buildLoginRedirectTarget(pathname, req.nextUrl.search),
      );
      loginUrl.searchParams.set('reason', 'auth-required');
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  // Authenticated and hitting /login → bounce home (or to redirectTo)
  if (pathname === '/login') {
    const target = getSafeRedirectTarget(searchParams.get('redirectTo'));
    return NextResponse.redirect(new URL(target, req.url));
  }

  // Authenticated, normal request — forward decoded claims
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-user-id', String(token.sub ?? ''));
  requestHeaders.set('x-user-role', String(token.role ?? ''));
  requestHeaders.set('x-user-team-id', String(token.teamId ?? ''));
  requestHeaders.set('x-user-username', String(token.username ?? ''));

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
};
