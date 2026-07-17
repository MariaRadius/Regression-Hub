import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';
import { ApiError } from '@/lib/errors';

const { db, reset } = createMockDb();
const { listApplications, createApplication } = vi.hoisted(() => ({
  listApplications: vi.fn(),
  createApplication: vi.fn(),
}));

vi.mock('@/lib/server/withTeam', () => ({
  withTeam: (handler) => async (_req, _ctx) => {
    try {
      return await handler(_req, _ctx, {
        session: { user: { teamId: 't1' } },
        teamId: 't1',
        db,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        return NextResponse.json(
          { error: err.message },
          { status: err.status },
        );
      }
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 },
      );
    }
  },
  withAdmin: (handler) => async (_req, _ctx) => {
    try {
      return await handler(_req, _ctx, {
        session: { user: { teamId: 't1', role: 'admin' } },
        teamId: 't1',
        db,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        return NextResponse.json(
          { error: err.message },
          { status: err.status },
        );
      }
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 },
      );
    }
  },
}));

vi.mock('@/lib/db/applicationsData', () => ({
  listApplications,
  createApplication,
}));

import { GET, POST } from '../route';

beforeEach(() => {
  reset();
  vi.clearAllMocks();
});

describe('GET /api/applications', () => {
  it('returns applications list', async () => {
    listApplications.mockResolvedValue([{ _id: 'a1', name: 'App' }]);
    const res = await GET(new Request('http://x/api/applications'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ _id: 'a1', name: 'App' }]);
    expect(listApplications).toHaveBeenCalledWith(db, 't1');
  });
});

describe('POST /api/applications', () => {
  it('creates application with name and prefix and returns 201', async () => {
    createApplication.mockResolvedValue({
      _id: 'a1',
      name: 'Foo',
      initial: 'FOO',
      teamId: 't1',
    });
    const req = new Request('http://x/api/applications', {
      method: 'POST',
      body: JSON.stringify({ name: 'Foo', initial: 'FOO' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      _id: 'a1',
      name: 'Foo',
      initial: 'FOO',
    });
    expect(createApplication).toHaveBeenCalledWith(db, 't1', {
      name: 'Foo',
      initial: 'FOO',
    });
  });

  it('creates application with name only (no prefix) and returns 201', async () => {
    createApplication.mockResolvedValue({
      _id: 'a2',
      name: 'Bar',
      initial: 'BAR',
      teamId: 't1',
    });
    const req = new Request('http://x/api/applications', {
      method: 'POST',
      body: JSON.stringify({ name: 'Bar' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(createApplication).toHaveBeenCalledWith(db, 't1', { name: 'Bar' });
  });

  it('returns 400 when name is empty string', async () => {
    const req = new Request('http://x/api/applications', {
      method: 'POST',
      body: JSON.stringify({ name: '' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(createApplication).not.toHaveBeenCalled();
  });

  it('returns 400 when prefix does not match [A-Z0-9]{3}', async () => {
    const req = new Request('http://x/api/applications', {
      method: 'POST',
      body: JSON.stringify({ name: 'Foo', initial: 'fo' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(createApplication).not.toHaveBeenCalled();
  });
});
