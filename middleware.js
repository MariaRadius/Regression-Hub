import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';

export async function middleware(req) {
  const { pathname, searchParams } = req.nextUrl;
  const token = await getToken({ req });
  const isLoggedIn = !!token;
  const isLoginPage = pathname === '/login';
  const isApi = pathname.startsWith('/api/');

  if (!isLoggedIn) {
    if (isApi) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!isLoginPage) {
      const url = new URL('/login', req.url);
      url.searchParams.set('redirectTo', pathname);
      return NextResponse.redirect(url);
    }
  }

  if (isLoggedIn && isLoginPage) {
    const target = searchParams.get('redirectTo') || '/dashboard';
    return NextResponse.redirect(new URL(target, req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
};
