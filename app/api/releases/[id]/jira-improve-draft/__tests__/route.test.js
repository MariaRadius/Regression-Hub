import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';

const { db, reset } = createMockDb();
const { improveJiraIssueDraft, isAiConfigured } = vi.hoisted(() => ({
  improveJiraIssueDraft: vi.fn(),
  isAiConfigured: vi.fn(() => true),
}));
const { getTeamSettings } = vi.hoisted(() => ({ getTeamSettings: vi.fn() }));
const { checkRateLimit } = vi.hoisted(() => ({
  checkRateLimit: vi.fn(() => ({ ok: true })),
}));

vi.mock('@/lib/server/withTeam', () => ({
  withTeam: (handler) => async (req, ctx) => {
    try {
      return await handler(req, ctx, {
        session: { user: { id: 'u1', teamId: 't1' } },
        teamId: 't1',
        db,
      });
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
  },
}));

vi.mock('@/lib/server/aiClient', () => ({
  improveJiraIssueDraft,
  isAiConfigured,
}));
vi.mock('@/lib/db/settingsData', () => ({ getTeamSettings }));
vi.mock('@/lib/rateLimit', () => ({ checkRateLimit }));

import { POST } from '../route';

const SETTINGS = { aiProvider: 'claude', aiApiKey: 'sk-test' };

function makeRequest(body) {
  return new Request('http://x', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  reset();
  vi.clearAllMocks();
  getTeamSettings.mockResolvedValue(SETTINGS);
  isAiConfigured.mockReturnValue(true);
  checkRateLimit.mockReturnValue({ ok: true });
});

describe('POST /api/releases/[id]/jira-improve-draft', () => {
  it('returns improved summary and description from AI', async () => {
    improveJiraIssueDraft.mockResolvedValue({
      summary: 'Improved summary',
      description: 'Improved description',
    });

    const res = await POST(
      makeRequest({
        summary: 'Original summary',
        description: 'Original description',
      }),
      {},
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      summary: 'Improved summary',
      description: 'Improved description',
    });
  });

  it('returns 400 for an invalid body', async () => {
    const res = await POST(makeRequest({ summary: '' }), {});
    expect(res.status).toBe(400);
    expect(improveJiraIssueDraft).not.toHaveBeenCalled();
  });

  it('returns 503 when AI is not configured', async () => {
    isAiConfigured.mockReturnValue(false);

    const res = await POST(
      makeRequest({ summary: 'Summary', description: 'Description' }),
      {},
    );

    expect(res.status).toBe(503);
    expect(improveJiraIssueDraft).not.toHaveBeenCalled();
  });

  it('returns 429 when rate limited', async () => {
    checkRateLimit.mockReturnValue({ ok: false });

    const res = await POST(
      makeRequest({ summary: 'Summary', description: 'Description' }),
      {},
    );

    expect(res.status).toBe(429);
    expect(improveJiraIssueDraft).not.toHaveBeenCalled();
  });

  it('returns 502 with the AI error message when the provider fails', async () => {
    improveJiraIssueDraft.mockRejectedValue(new Error('Claude API error: 401'));

    const res = await POST(
      makeRequest({ summary: 'Summary', description: 'Description' }),
      {},
    );

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe('Claude API error: 401');
  });

  it('returns 502 with a fallback message when the AI error has no message', async () => {
    improveJiraIssueDraft.mockRejectedValue({ message: undefined });

    const res = await POST(
      makeRequest({ summary: 'Summary', description: 'Description' }),
      {},
    );

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toContain('AI improvement failed');
  });
});
