import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { hash } from 'bcryptjs';

export async function PATCH(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({}, { status: 401 });
    if (session.user.role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

    const { id } = await params;
    const body = await request.json();
    const db = await getDb();

    const user = await db.collection('users').findOne({
      _id: new ObjectId(id),
      teamId: session.user.teamId,
    });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const update = { updatedAt: new Date() };

    if (body.name !== undefined)   update.name = body.name.trim();
    if (body.role !== undefined && ['admin', 'qa'].includes(body.role)) update.role = body.role;

    // Active toggle — prevent self-deactivation
    if (body.active !== undefined) {
      if (!body.active && user._id.toString() === session.user.id) {
        return NextResponse.json({ error: 'You cannot deactivate your own account' }, { status: 400 });
      }
      update.active = body.active;
    }

    // Password change
    if (body.password) {
      if (body.password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
      if (body.password.length > 128) return NextResponse.json({ error: 'Password too long' }, { status: 400 });
      update.passwordHash = await hash(body.password, 12);
    }

    await db.collection('users').updateOne({ _id: new ObjectId(id) }, { $set: update });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('PATCH /api/users/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({}, { status: 401 });
    if (session.user.role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

    const { id } = await params;
    const db = await getDb();

    if (id === session.user.id) {
      return NextResponse.json({ error: 'You cannot remove your own account' }, { status: 400 });
    }

    const user = await db.collection('users').findOne({
      _id: new ObjectId(id),
      teamId: session.user.teamId,
    });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Deactivate instead of hard delete for audit trail
    await db.collection('users').updateOne(
      { _id: new ObjectId(id) },
      { $set: { active: false, updatedAt: new Date() } }
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('DELETE /api/users/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
