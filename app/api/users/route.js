import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/mongodb';
import { hash } from 'bcryptjs';
import { checkRateLimit } from '@/lib/rateLimit';

const LOCATIONS = {
  radius: 'Radius',
  cb: 'CB',
};

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({}, { status: 401 });
    if (session.user.role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

    const db = await getDb();
    const teamId = session.user.teamId;

    const users = await db.collection('users')
      .find({ teamId }, { projection: { passwordHash: 0 } })
      .sort({ role: 1, name: 1 })
      .toArray();

    return NextResponse.json(users.map((u) => ({ ...u, _id: u._id.toString() })));
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({}, { status: 401 });
    if (session.user.role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

    // Rate limit: max 10 user-creations per admin per minute
    const rl = checkRateLimit(`users:create:${session.user.id}`, 10, 60_000);
    if (!rl.ok) return NextResponse.json({ error: 'Too many requests — try again shortly' }, { status: 429 });

    const body = await request.json();
    const { name, username, password, role } = body;

    if (!name?.trim() || name.trim().length > 80) return NextResponse.json({ error: 'Name is required (max 80 chars)' }, { status: 400 });
    if (!username?.trim() || username.trim().length > 40) return NextResponse.json({ error: 'Username is required (max 40 chars)' }, { status: 400 });
    if (!password || password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    if (password.length > 128) return NextResponse.json({ error: 'Password too long' }, { status: 400 });
    if (!['admin', 'qa'].includes(role)) return NextResponse.json({ error: 'Role must be admin or qa' }, { status: 400 });

    const db = await getDb();
    const teamId = session.user.teamId;
    const teamName = LOCATIONS[teamId] || session.user.teamName;

    const existing = await db.collection('users').findOne({ username: username.trim().toLowerCase() });
    if (existing) return NextResponse.json({ error: 'Username already taken' }, { status: 409 });

    const passwordHash = await hash(password, 12);
    const now = new Date();
    const doc = {
      username: username.trim().toLowerCase(),
      name: name.trim(),
      passwordHash,
      teamId,
      teamName,
      role,
      active: true,
      createdBy: session.user.username,
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.collection('users').insertOne(doc);
    return NextResponse.json({ ok: true, id: result.insertedId.toString() }, { status: 201 });
  } catch (error) {
    if (error.code === 11000) return NextResponse.json({ error: 'Username already taken' }, { status: 409 });
    console.error('POST /api/users error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
