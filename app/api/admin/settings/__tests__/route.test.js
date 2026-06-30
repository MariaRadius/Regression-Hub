import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';
import { ApiError } from '@/lib/errors';

const { db, reset } = createMockDb();

const { appendAdminActivity, getTeamSettings, updateTeamSettings } = vi.hoisted(
  () => ({
    appendAdminActivity: vi.fn(),
    getTeamSettings: vi.fn(),
    updateTeamSettings: vi.fn(),
  }),
);

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

vi.mock('@/lib/db/settingsData', () => ({
  getTeamSettings,
  updateTeamSettings,
}));

vi.mock('@/lib/db/adminActivityData', () => ({ appendAdminActivity }));

import { PATCH } from '../route';

beforeEach(() => {
  reset();
  vi.clearAllMocks();
  getTeamSettings.mockResolvedValue({
    failureThreshold: 5,
    topModulesLimit: 5,
    jiraIssueMode: 'ask',
  });
  appendAdminActivity.mockResolvedValue(undefined);
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

  it('saves a valid jiraIssueMode', async () => {
    updateTeamSettings.mockResolvedValue(undefined);
    const res = await PATCH(makeRequest({ jiraIssueMode: 'auto' }));
    expect(res.status).toBe(200);
    expect(updateTeamSettings).toHaveBeenCalledWith(db, 't1', {
      jiraIssueMode: 'auto',
    });
  });

  it('rejects an unknown jiraIssueMode', async () => {
    const res = await PATCH(makeRequest({ jiraIssueMode: 'always' }));
    expect(res.status).toBe(400);
  });

  it('saves a valid jiraSyncThrottleHours', async () => {
    updateTeamSettings.mockResolvedValue(undefined);
    const res = await PATCH(makeRequest({ jiraSyncThrottleHours: 2 }));
    expect(res.status).toBe(200);
    expect(updateTeamSettings).toHaveBeenCalledWith(db, 't1', {
      jiraSyncThrottleHours: 2,
    });
  });

  it('rejects jiraSyncThrottleHours below 1', async () => {
    const res = await PATCH(makeRequest({ jiraSyncThrottleHours: 0 }));
    expect(res.status).toBe(400);
  });

  it('rejects jiraSyncThrottleHours above 24', async () => {
    const res = await PATCH(makeRequest({ jiraSyncThrottleHours: 25 }));
    expect(res.status).toBe(400);
  });
});
