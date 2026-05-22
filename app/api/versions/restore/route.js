import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { restoreVersion } from '@/lib/versionsData';

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.user.role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    const { version } = await request.json();
    if (!version) return NextResponse.json({ error: 'version required' }, { status: 400 });
    const result = await restoreVersion({ teamId: session.user.teamId, version });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const status = error.message === 'No test cases found' ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}
