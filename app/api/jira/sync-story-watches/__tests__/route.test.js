import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';

const { db, reset } = createMockDb();

const {
  getTeamSettings,
  isJiraConfigured,
  getIssuesByKeys,
  listDistinctStoryKeys,
  listStoryWatches,
  upsertStoryWatch,
} = vi.hoisted(() => ({
  getTeamSettings: vi.fn(),
  isJiraConfigured: vi.fn(),
  getIssuesByKeys: vi.fn(),
  listDistinctStoryKeys: vi.fn(),
  listStoryWatches: vi.fn(),
  upsertStoryWatch: vi.fn(),
}));

vi.mock('@/lib/server/withTeam', () => {
  const wrap = (handler) => async (req, ctx) => {
    try {
      return await handler(req, ctx, { teamId: 't1', db });
    } catch (err) {
      if (err?.name === 'ApiError') {
        const { NextResponse } = await import('next/server');
        return NextResponse.json(
          { error: err.message },
          { status: err.status },
        );
      }
      throw err;
    }
  };
  return { withTeam: wrap, withAdmin: wrap };
});

vi.mock('@/lib/db/settingsData', () => ({ getTeamSettings }));
vi.mock('@/lib/server/jiraClient', () => ({
  isJiraConfigured,
  getIssuesByKeys,
}));
vi.mock('@/lib/db/jiraStoryWatchesData', () => ({
  listDistinctStoryKeys,
  listStoryWatches,
  upsertStoryWatch,
}));

import { POST } from '../route';

const REQ = new Request('http://x/api/jira/sync-story-watches', {
  method: 'POST',
});
const REQ_FORCE = new Request(
  'http://x/api/jira/sync-story-watches?force=true',
  { method: 'POST' },
);

beforeEach(() => {
  reset();
  vi.clearAllMocks();
  getTeamSettings.mockResolvedValue({
    jiraBaseUrl: 'https://example.atlassian.net',
    jiraApiToken: 'tok',
  });
  isJiraConfigured.mockReturnValue(true);
});

describe('POST /api/jira/sync-story-watches', () => {
  it('returns stale stories after a successful Jira fetch', async () => {
    listDistinctStoryKeys.mockResolvedValue(['SAP-1']);
    const oldChecked = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago — stale
    listStoryWatches.mockResolvedValue([
      {
        storyKey: 'SAP-1',
        jiraCheckedAt: oldChecked,
        jiraUpdatedAt: null,
        acknowledgedAt: null,
      },
    ]);
    const jiraUpdatedAt = new Date('2026-06-01T00:00:00Z');
    getIssuesByKeys.mockResolvedValue([
      { key: 'SAP-1', summary: 'Login flow', updatedAt: jiraUpdatedAt },
    ]);
    upsertStoryWatch.mockResolvedValue();

    const res = await POST(REQ, {});
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.stories).toHaveLength(1);
    expect(body.stories[0].storyKey).toBe('SAP-1');
    expect(body.stories[0].jiraSummary).toBe('Login flow');
    expect(upsertStoryWatch).toHaveBeenCalledWith(
      db,
      't1',
      expect.objectContaining({
        storyKey: 'SAP-1',
        jiraUpdatedAt,
        jiraSummary: 'Login flow',
      }),
    );
  });

  it('skips the Jira API call when jiraCheckedAt is recent (throttle)', async () => {
    listDistinctStoryKeys.mockResolvedValue(['SAP-1']);
    const recentChecked = new Date(Date.now() - 5 * 60 * 1000); // 5 min ago — fresh
    const jiraUpdatedAt = new Date('2026-05-01T00:00:00Z');
    listStoryWatches.mockResolvedValue([
      {
        storyKey: 'SAP-1',
        jiraCheckedAt: recentChecked,
        jiraUpdatedAt,
        acknowledgedAt: null,
      },
    ]);

    const res = await POST(REQ, {});
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(getIssuesByKeys).not.toHaveBeenCalled();
    // Story is stale (acknowledgedAt null) — returned from cache
    expect(body.stories).toHaveLength(1);
    expect(body.stories[0].storyKey).toBe('SAP-1');
  });

  it('returns empty stories when Jira is not configured', async () => {
    isJiraConfigured.mockReturnValue(false);
    const res = await POST(REQ, {});
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.stories).toEqual([]);
    expect(getIssuesByKeys).not.toHaveBeenCalled();
  });

  it('returns empty stories when team has no linked Jira stories', async () => {
    listDistinctStoryKeys.mockResolvedValue([]);
    const res = await POST(REQ, {});
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.stories).toEqual([]);
  });

  it('serves cached stale stories when getIssuesByKeys throws (graceful degradation)', async () => {
    listDistinctStoryKeys.mockResolvedValue(['SAP-1']);
    const oldChecked = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const jiraUpdatedAt = new Date('2026-05-01T00:00:00Z');
    listStoryWatches.mockResolvedValue([
      {
        storyKey: 'SAP-1',
        jiraCheckedAt: oldChecked,
        jiraUpdatedAt,
        jiraSummary: 'Cached',
        acknowledgedAt: null,
      },
    ]);
    getIssuesByKeys.mockRejectedValue(new Error('Network error'));

    const res = await POST(REQ, {});
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.stories[0].storyKey).toBe('SAP-1');
    expect(body.stories[0].jiraSummary).toBe('Cached');
  });

  it('bypasses throttle and calls Jira when force=true even if jiraCheckedAt is recent', async () => {
    listDistinctStoryKeys.mockResolvedValue(['SAP-1']);
    const recentChecked = new Date(Date.now() - 5 * 60 * 1000); // 5 min ago — would normally be throttled
    listStoryWatches.mockResolvedValue([
      {
        storyKey: 'SAP-1',
        jiraCheckedAt: recentChecked,
        jiraUpdatedAt: new Date('2026-05-01T00:00:00Z'),
        acknowledgedAt: null,
      },
    ]);
    const freshUpdatedAt = new Date('2026-06-20T00:00:00Z');
    getIssuesByKeys.mockResolvedValue([
      { key: 'SAP-1', summary: 'Login flow', updatedAt: freshUpdatedAt },
    ]);
    upsertStoryWatch.mockResolvedValue();

    const res = await POST(REQ_FORCE, {});
    const body = await res.json();

    expect(getIssuesByKeys).toHaveBeenCalled();
    expect(body.stories[0].storyKey).toBe('SAP-1');
  });

  it('excludes stories where jiraUpdatedAt <= acknowledgedAt', async () => {
    listDistinctStoryKeys.mockResolvedValue(['SAP-1', 'SAP-2']);
    const updatedAt = new Date('2026-05-01T00:00:00Z');
    const acknowledgedAfter = new Date('2026-06-01T00:00:00Z');
    const recentChecked = new Date(Date.now() - 5 * 60 * 1000);
    listStoryWatches.mockResolvedValue([
      // SAP-1: updated before acknowledged — NOT stale
      {
        storyKey: 'SAP-1',
        jiraCheckedAt: recentChecked,
        jiraUpdatedAt: updatedAt,
        acknowledgedAt: acknowledgedAfter,
      },
      // SAP-2: acknowledgedAt is null — IS stale
      {
        storyKey: 'SAP-2',
        jiraCheckedAt: recentChecked,
        jiraUpdatedAt: updatedAt,
        acknowledgedAt: null,
      },
    ]);

    const res = await POST(REQ, {});
    const body = await res.json();

    expect(body.stories).toHaveLength(1);
    expect(body.stories[0].storyKey).toBe('SAP-2');
  });
});
