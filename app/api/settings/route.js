import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/mongodb';

const TEAM_QA_USERS = {
  radius: ['Ammad', 'Maria', 'Sohail'],
  cb: ['Ali', 'Nimra', 'Aimen', 'Hamza'],
};

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({}, { status: 401 });
    const db = await getDb();
    const teamId = session.user.teamId;
    const settings = await db.collection('teamSettings').findOne(
      { teamId },
      { projection: { testEnvironment: 1, softwareVersion: 1 } }
    );
    return NextResponse.json({
      ...(settings || {}),
      qaUsers: TEAM_QA_USERS[teamId] || [],
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({}, { status: 401 });
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
