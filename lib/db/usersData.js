import { hash } from 'bcryptjs';
import { ObjectId } from 'mongodb';
import {
  ALL_ROLES,
  AUDIT_ACTION,
  AUDIT_CATEGORY,
  ROLES,
  TEAMS,
} from '@/lib/constants';
import { appendAdminActivity } from '@/lib/db/adminActivityData';
import { toClientDoc } from '@/lib/db/util';
import { ApiError } from '@/lib/errors';
import { getDb } from '@/lib/mongodb';

const TEAM_DISPLAY_NAMES = Object.freeze({
  [TEAMS.RADIUS]: 'Radius',
  [TEAMS.CB]: 'CB',
});

/**
 * Fetch all users for a team.
 *
 * Supports two call signatures:
 *   getUsers(teamId, filters)        — acquires its own DB connection (for RSC pages)
 *   getUsers(db, teamId, filters)    — uses the provided DB connection (for route handlers)
 */
export async function getUsers(db, teamId, filters = {}) {
  if (typeof db === 'string') {
    filters = teamId ?? {};
    teamId = db;
    db = await getDb();
  }
  if (!teamId) throw new Error('teamId required');

  const query = { teamId };
  if (filters.role) query.role = filters.role;
  if (filters.active !== undefined) query.active = filters.active;

  const users = await db
    .collection('users')
    .find(query, { projection: { passwordHash: 0 } })
    .sort({ role: 1, name: 1 })
    .toArray();
  return users.map((u) => toClientDoc(u));
}

export async function createUser(
  db,
  teamId,
  body,
  { createdBy, teamName: sessionTeamName, actor },
) {
  const { name, username, password, role } = body;
  if (!name?.trim() || name.trim().length > 80)
    throw new ApiError(400, 'Name is required (max 80 chars)');
  if (!username?.trim() || username.trim().length > 40)
    throw new ApiError(400, 'Username is required (max 40 chars)');
  if (!password || password.length < 8)
    throw new ApiError(400, 'Password must be at least 8 characters');
  if (password.length > 128) throw new ApiError(400, 'Password too long');
  if (!ALL_ROLES.includes(role))
    throw new ApiError(400, `Role must be ${ROLES.ADMIN} or ${ROLES.QA}`);

  const teamName = TEAM_DISPLAY_NAMES[teamId] || sessionTeamName;
  const existing = await db
    .collection('users')
    .findOne({ username: username.trim().toLowerCase() });
  if (existing) throw new ApiError(409, 'Username already taken');

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
    createdBy,
    createdAt: now,
    updatedAt: now,
  };

  try {
    const result = await db.collection('users').insertOne(doc);
    await appendAdminActivity(db, teamId, {
      category: AUDIT_CATEGORY.USER,
      action: AUDIT_ACTION.CREATE,
      by: actor,
      targetUserId: result.insertedId.toString(),
      targetUserName: doc.name,
      targetUsername: doc.username,
      changes: [
        { label: 'Role', before: '—', after: doc.role },
        { label: 'Status', before: '—', after: 'Active' },
      ],
    });
    return { ok: true, id: result.insertedId.toString() };
  } catch (err) {
    if (err.code === 11000) throw new ApiError(409, 'Username already taken');
    throw err;
  }
}

export async function updateUser(
  db,
  teamId,
  id,
  body,
  { sessionUserId, actor },
) {
  const user = await db.collection('users').findOne({
    _id: new ObjectId(id),
    teamId,
  });
  if (!user) throw new ApiError(404, 'User not found');

  const update = { updatedAt: new Date() };
  if (body.name !== undefined) update.name = body.name.trim();
  if (body.role !== undefined && ALL_ROLES.includes(body.role))
    update.role = body.role;

  if (body.active !== undefined) {
    if (!body.active && user._id.toString() === sessionUserId) {
      throw new ApiError(400, 'You cannot deactivate your own account');
    }
    update.active = body.active;
  }

  if (body.password) {
    if (body.password.length < 8)
      throw new ApiError(400, 'Password must be at least 8 characters');
    if (body.password.length > 128)
      throw new ApiError(400, 'Password too long');
    update.passwordHash = await hash(body.password, 12);
  }

  await db
    .collection('users')
    .updateOne({ _id: new ObjectId(id) }, { $set: update });

  const changes = [];
  if (body.name !== undefined && user.name !== update.name) {
    changes.push({
      label: 'Name',
      before: user.name ?? '—',
      after: update.name ?? '—',
    });
  }
  if (body.role !== undefined && user.role !== update.role) {
    changes.push({
      label: 'Role',
      before: user.role ?? '—',
      after: update.role ?? '—',
    });
  }
  if (body.active !== undefined && user.active !== update.active) {
    changes.push({
      label: 'Status',
      before: user.active ? 'Active' : 'Inactive',
      after: update.active ? 'Active' : 'Inactive',
    });
  }
  if (body.password) {
    changes.push({
      label: 'Password',
      before: 'Updated securely',
      after: 'Updated securely',
    });
  }

  if (changes.length > 0) {
    let action = AUDIT_ACTION.UPDATE;
    if (body.role !== undefined && user.role !== update.role) {
      action = AUDIT_ACTION.ROLE_CHANGE;
    } else if (body.password) {
      action = AUDIT_ACTION.PASSWORD_CHANGE;
    } else if (body.active !== undefined && user.active !== update.active) {
      action = update.active ? AUDIT_ACTION.ACTIVATE : AUDIT_ACTION.DEACTIVATE;
    }

    await appendAdminActivity(db, teamId, {
      category: AUDIT_CATEGORY.USER,
      action,
      by: actor,
      targetUserId: user._id.toString(),
      targetUserName: user.name,
      targetUsername: user.username,
      changes,
    });
  }

  return { ok: true };
}
