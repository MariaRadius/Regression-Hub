import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getVersionHistoryDetail } from '@/lib/versionsData';

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { searchParams } = new URL(request.url);
    const version = searchParams.get('version');
    if (!version) return NextResponse.json({ error: 'version required' }, { status: 400 });
    const data = await getVersionHistoryDetail({ teamId: session.user.teamId, version });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
