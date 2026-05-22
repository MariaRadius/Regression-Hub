import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getVersions, deleteVersion } from '@/lib/versionsData';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const versions = await getVersions({ teamId: session.user.teamId });
    return NextResponse.json(versions, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.user.role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    const { searchParams } = new URL(request.url);
    const version = searchParams.get('version');
    const isCurrent = searchParams.get('isCurrent') === 'true';
    if (!version) return NextResponse.json({ error: 'version param required' }, { status: 400 });
    const result = await deleteVersion({ teamId: session.user.teamId, version, isCurrent });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
