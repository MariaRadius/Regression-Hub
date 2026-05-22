import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rateLimit';
import { getTeamSettings, updateTeamSettings } from '@/lib/settingsData';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const settings = await getTeamSettings({ teamId: session.user.teamId });
    return NextResponse.json(settings);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.user.role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    const rl = checkRateLimit(`settings:put:${session.user.id}`, 30, 60_000);
    if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    const body = await request.json();
    await updateTeamSettings({ teamId: session.user.teamId, patch: body });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
