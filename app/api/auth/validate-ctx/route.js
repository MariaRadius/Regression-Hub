import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { releaseExistsForTeam } from '@/lib/db/releasesData';
import { getDb } from '@/lib/mongodb';
import { parseReleaseCtxCookie, RELEASE_CTX_COOKIE } from '@/lib/releaseCtx';

export async function POST(request) {
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });
  if (!token?.teamId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const raw = request.cookies.get(RELEASE_CTX_COOKIE)?.value;
  const stored = parseReleaseCtxCookie(raw);

  if (!stored) {
    return NextResponse.json({ cleared: false });
  }

  const db = await getDb();
  const exists = await releaseExistsForTeam(db, token.teamId, stored.releaseId);

  if (!exists) {
    const response = NextResponse.json({ cleared: true });
    response.cookies.delete(RELEASE_CTX_COOKIE);
    return response;
  }

  return NextResponse.json({ cleared: false });
}
