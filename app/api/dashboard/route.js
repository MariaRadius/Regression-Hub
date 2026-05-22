import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDashboardData } from '@/lib/dashboardData';

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const applicationId = new URL(request.url).searchParams.get('applicationId') || '';
    const data = await getDashboardData({ teamId: session.user.teamId, applicationId });

    return NextResponse.json(data, { headers: { 'Cache-Control': 'private, max-age=10, stale-while-revalidate=30' } });
  } catch (error) {
    console.error('Dashboard error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
