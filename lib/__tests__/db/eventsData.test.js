import { ObjectId } from 'mongodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectApiError } from '@/lib/__tests__/helpers/expectApiError';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';
import { AUDIT_ACTION, AUDIT_CATEGORY } from '@/lib/constants';
import { appendEvent, appendEvents, listEvents } from '@/lib/db/eventsData';

const TEAM = 'team-1';
const { db, collections, reset } = createMockDb();

beforeEach(() => reset());

describe('appendEvent', () => {
  it('calls insertOne with teamId merged into the event doc', async () => {
    collections.events = {
      insertOne: vi.fn().mockResolvedValue({ insertedId: new ObjectId() }),
    };

    const event = {
      category: AUDIT_CATEGORY.RESULT,
      action: AUDIT_ACTION.PASS,
      tcId: 'abc001',
      externalId: 'EX-1',
      status: 'Pass',
      notes: 'ok',
      assignmentId: null,
      assignedTo: null,
      by: 'Alice',
      at: new Date('2026-01-01T00:00:00Z'),
    };

    await appendEvent(db, TEAM, event);

    expect(collections.events.insertOne).toHaveBeenCalledOnce();
    const doc = collections.events.insertOne.mock.calls[0][0];
    expect(doc.teamId).toBe(TEAM);
    expect(doc.action).toBe(AUDIT_ACTION.PASS);
    expect(doc.by).toBe('Alice');
  });

  it('throws ApiError(400) when teamId is missing', async () => {
    await expectApiError(appendEvent(db, '', { action: AUDIT_ACTION.PASS }), {
      status: 400,
    });
    await expectApiError(appendEvent(db, null, { action: AUDIT_ACTION.PASS }), {
      status: 400,
    });
  });

  it('propagates DB failure from insertOne', async () => {
    collections.events = {
      insertOne: vi.fn().mockRejectedValue(new Error('DB error')),
    };

    await expect(
      appendEvent(db, TEAM, {
        category: AUDIT_CATEGORY.RESULT,
        action: AUDIT_ACTION.PASS,
        tcId: 'abc001',
        by: 'Alice',
        at: new Date(),
      }),
    ).rejects.toThrow('DB error');
  });
});

describe('appendEvents', () => {
  it('is a no-op when the events array is empty', async () => {
    collections.events = {
      insertMany: vi.fn().mockResolvedValue({ insertedCount: 0 }),
    };

    await appendEvents(db, TEAM, []);

    expect(collections.events.insertMany).not.toHaveBeenCalled();
  });

  it('inserts one doc per event via insertMany', async () => {
    collections.events = {
      insertMany: vi.fn().mockResolvedValue({ insertedCount: 2 }),
    };

    const events = [
      {
        action: AUDIT_ACTION.PASS,
        tcId: 'abc001',
        by: 'Alice',
        at: new Date(),
      },
      {
        action: AUDIT_ACTION.FAIL,
        tcId: 'abc002',
        by: 'Alice',
        at: new Date(),
      },
    ];

    await appendEvents(db, TEAM, events);

    expect(collections.events.insertMany).toHaveBeenCalledOnce();
    const docs = collections.events.insertMany.mock.calls[0][0];
    expect(docs).toHaveLength(2);
    expect(docs[0].teamId).toBe(TEAM);
    expect(docs[0].action).toBe(AUDIT_ACTION.PASS);
    expect(docs[1].teamId).toBe(TEAM);
    expect(docs[1].action).toBe(AUDIT_ACTION.FAIL);
  });

  it('throws ApiError(400) when teamId is missing', async () => {
    await expectApiError(
      appendEvents(db, null, [{ action: AUDIT_ACTION.PASS }]),
      { status: 400 },
    );
  });
});

describe('listEvents', () => {
  it('sorts by at desc and returns toClientDoc-mapped docs', async () => {
    const id1 = new ObjectId();
    const id2 = new ObjectId();
    const at1 = new Date('2026-01-02T00:00:00Z');
    const at2 = new Date('2026-01-01T00:00:00Z');

    const rawDocs = [
      {
        _id: id1,
        teamId: TEAM,
        tcId: 'abc001',
        action: AUDIT_ACTION.PASS,
        at: at1,
      },
      {
        _id: id2,
        teamId: TEAM,
        tcId: 'abc001',
        action: AUDIT_ACTION.FAIL,
        at: at2,
      },
    ];

    collections.events = {
      find: vi.fn(() => ({
        sort: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue(rawDocs) })),
      })),
    };

    const results = await listEvents(db, TEAM, { tcId: 'abc001' });

    expect(collections.events.find).toHaveBeenCalledWith({
      teamId: TEAM,
      tcId: 'abc001',
    });

    const sortMock = collections.events.find.mock.results[0].value.sort;
    expect(sortMock).toHaveBeenCalledWith({ at: -1 });

    expect(results).toHaveLength(2);
    expect(results[0]._id).toBe(id1.toString());
    expect(results[0].at).toBe(at1.toISOString());
    expect(results[1]._id).toBe(id2.toString());
  });

  it('filters by releaseId when provided', async () => {
    collections.events = {
      find: vi.fn(() => ({
        sort: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
      })),
    };

    await listEvents(db, TEAM, { releaseId: 'rel-1' });

    expect(collections.events.find).toHaveBeenCalledWith({
      teamId: TEAM,
      releaseId: 'rel-1',
    });
  });

  it('filters by releaseId, tcId, and categories together when provided', async () => {
    collections.events = {
      find: vi.fn(() => ({
        sort: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
      })),
    };

    await listEvents(db, TEAM, {
      tcId: 'abc001',
      releaseId: 'rel-1',
      categories: [AUDIT_CATEGORY.RESULT, AUDIT_CATEGORY.TEST_CASE],
    });

    expect(collections.events.find).toHaveBeenCalledWith({
      teamId: TEAM,
      tcId: 'abc001',
      releaseId: 'rel-1',
      category: { $in: [AUDIT_CATEGORY.RESULT, AUDIT_CATEGORY.TEST_CASE] },
    });
  });

  it('throws ApiError(400) when teamId is missing', async () => {
    await expectApiError(listEvents(db, null, { tcId: 'abc001' }), {
      status: 400,
    });
  });
});
