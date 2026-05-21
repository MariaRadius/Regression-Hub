import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/mongodb';
import { checkRateLimit } from '@/lib/rateLimit';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({}, { status: 401 });
    const db = await getDb();
    const teamId = session.user.teamId;

    const [settings, users] = await Promise.all([
      db.collection('teamSettings').findOne(
        { teamId },
        { projection: { testEnvironment: 1, softwareVersion: 1 } }
      ),
      db.collection('users')
        .find({ teamId, active: { $ne: false } }, { projection: { name: 1 } })
        .sort({ name: 1 })
        .toArray(),
    ]);

    const qaUsers = users.map((u) => u.name);

    return NextResponse.json({
      ...(settings || {}),
      qaUsers,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({}, { status: 401 });
    if (session.user.role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

    // Rate limit: 30 settings updates per admin per minute
    const rl = checkRateLimit(`settings:put:${session.user.id}`, 30, 60_000);
    if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    const body = await request.json();
    const db = await getDb();
    // Only set fields that were actually provided — partial updates are fine
    const update = { updatedAt: new Date() };
    if (body.testEnvironment !== undefined) update.testEnvironment = body.testEnvironment;
    if (body.softwareVersion !== undefined) update.softwareVersion = body.softwareVersion;
    await db.collection('teamSettings').updateOne(
      { teamId: session.user.teamId },
      { $set: update },
      { upsert: true }
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
