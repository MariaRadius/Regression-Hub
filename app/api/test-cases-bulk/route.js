import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

const ALLOWED_FIELDS = [
  'actualResult', 'status', 'defectsImprovements',
  'testedBy', 'testedOn', 'softwareVersionTested',
];

export async function PATCH(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { ids, filter, fields, pendingOnly } = body;
    if ((!ids?.length && !filter) || !fields) {
      return NextResponse.json({ error: 'ids or filter, and fields are required' }, { status: 400 });
    }

    const db = await getDb();
    const teamId = session.user.teamId;

    const update = {};
    for (const field of ALLOWED_FIELDS) {
      if (field in fields) update[field] = fields[field];
    }
    update.updatedAt = new Date();

    let matchQuery;

    if (ids?.length) {
      // ID-based mode: update specific rows (used for selected rows)
      matchQuery = { _id: { $in: ids.map((id) => new ObjectId(id)) }, teamId };
      if (pendingOnly) matchQuery.status = { $nin: ['Pass', 'Fail'] };
    } else {
      // Filter-based mode: update all rows matching the current view filters
      matchQuery = { teamId };
      if (filter.applicationId) matchQuery.applicationId = filter.applicationId;
      if (filter.moduleId)      matchQuery.moduleId = filter.moduleId;
      if (filter.version)       matchQuery.softwareVersionTested = { $regex: filter.version, $options: 'i' };
      if (filter.testedBy === '__unassigned__') {
        matchQuery.$or = [{ testedBy: '' }, { testedBy: null }, { testedBy: { $exists: false } }];
      } else if (filter.testedBy) {
        matchQuery.testedBy = filter.testedBy;
      }
      if (pendingOnly) matchQuery.status = { $nin: ['Pass', 'Fail'] };
    }

    const result = await db.collection('testCases').updateMany(matchQuery, { $set: update });
    return NextResponse.json({ ok: true, updated: result.modifiedCount });
  } catch (error) {
    console.error('Bulk PATCH error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
