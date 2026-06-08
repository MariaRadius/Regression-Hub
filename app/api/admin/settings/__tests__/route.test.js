import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';
import { ApiError } from '@/lib/errors';

const { db, reset } = createMockDb();

const { updateTeamSettings } = vi.hoisted(() => ({
  updateTeamSettings: vi.fn(),
}));

vi.mock('@/lib/server/withTeam', () => ({
  withAdmin: (handler) => async (req, ctx) => {
    try {
      return await handler(req, ctx, {
        session: { user: { id: 'u1', teamId: 't1', role: 'admin' } },
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

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/db/settingsData', () => ({ updateTeamSettings }));

import { PATCH } from '../route';

beforeEach(() => {
  reset();
  vi.clearAllMocks();
});

function makeRequest(body) {
  return { json: () => Promise.resolve(body) };
}

describe('PATCH /api/admin/settings', () => {
  it('saves valid settings and returns ok', async () => {
    updateTeamSettings.mockResolvedValue(undefined);
    const res = await PATCH(
      makeRequest({ failureThreshold: 10, topModulesLimit: 3 }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(updateTeamSettings).toHaveBeenCalledWith(db, 't1', {
      failureThreshold: 10,
      topModulesLimit: 3,
    });
  });

  it('rejects out-of-range failureThreshold', async () => {
    const res = await PATCH(makeRequest({ failureThreshold: 0 }));
    expect(res.status).toBe(400);
  });

  it('rejects out-of-range topModulesLimit', async () => {
    const res = await PATCH(makeRequest({ topModulesLimit: 99 }));
    expect(res.status).toBe(400);
  });

  it('rejects empty body', async () => {
    const res = await PATCH(makeRequest({}));
    expect(res.status).toBe(400);
  });
});
