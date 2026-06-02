import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/errors';

const { getServerSession, getDb } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  getDb: vi.fn(),
}));

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/mongodb', () => ({ getDb }));

import { withAdmin, withTeam } from '@/lib/server/withTeam';

const mockDb = { collection: vi.fn() };

beforeEach(() => {
  getServerSession.mockReset();
  getDb.mockReset();
  getDb.mockResolvedValue(mockDb);
});

describe('withTeam', () => {
  it('returns 401 when session is missing', async () => {
    getServerSession.mockResolvedValue(null);
    const handler = vi.fn();
    const wrapped = withTeam(handler);
    const res = await wrapped(new Request('http://x'), {});
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'Unauthorized' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('returns 401 when teamId is falsy', async () => {
    getServerSession.mockResolvedValue({ user: { teamId: '', role: 'admin' } });
    const wrapped = withTeam(vi.fn());
    const res = await wrapped(new Request('http://x'), {});
    expect(res.status).toBe(401);
  });

  it('returns 403 for admin route when role is not admin', async () => {
    getServerSession.mockResolvedValue({
      user: { teamId: 't1', role: 'qa' },
    });
    const wrapped = withAdmin(vi.fn());
    const res = await wrapped(new Request('http://x'), {});
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Admin access required');
  });

  it('injects session, teamId, and db', async () => {
    const session = { user: { teamId: 'radius', role: 'admin', id: 'u1' } };
    getServerSession.mockResolvedValue(session);
    const handler = vi.fn(async (_req, _ctx, ctx) =>
      Response.json({ teamId: ctx.teamId, hasDb: !!ctx.db }),
    );
    const wrapped = withTeam(handler);
    const res = await wrapped(new Request('http://x'), {});
    expect(handler).toHaveBeenCalled();
    const body = await res.json();
    expect(body).toEqual({ teamId: 'radius', hasDb: true });
  });

  it('skips database setup when includeDb is false', async () => {
    const session = { user: { teamId: 'radius', role: 'admin', id: 'u1' } };
    getServerSession.mockResolvedValue(session);
    const handler = vi.fn(async (_req, _ctx, ctx) =>
      Response.json({ teamId: ctx.teamId, hasDb: Object.hasOwn(ctx, 'db') }),
    );
    const wrapped = withTeam(handler, { includeDb: false });
    const res = await wrapped(new Request('http://x'), {});

    expect(getDb).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body).toEqual({ teamId: 'radius', hasDb: false });
  });

  it('maps ApiError to JSON with canonical body', async () => {
    getServerSession.mockResolvedValue({
      user: { teamId: 't1', role: 'admin' },
    });
    const handler = vi.fn(async () => {
      throw new ApiError(400, 'Bad input');
    });
    const res = await withTeam(handler)(new Request('http://x'), {});
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Bad input' });
  });

  it('maps ApiError with custom payload', async () => {
    getServerSession.mockResolvedValue({
      user: { teamId: 't1', role: 'admin' },
    });
    const handler = vi.fn(async () => {
      throw new ApiError(400, 'validation', {
        error: 'validation',
        fields: { x: 'y' },
      });
    });
    const res = await withTeam(handler)(new Request('http://x'), {});
    expect(await res.json()).toEqual({
      error: 'validation',
      fields: { x: 'y' },
    });
  });

  it('maps unknown errors to 500', async () => {
    getServerSession.mockResolvedValue({
      user: { teamId: 't1', role: 'admin' },
    });
    const handler = vi.fn(async () => {
      throw new Error('boom');
    });
    const res = await withTeam(handler)(new Request('http://x'), {});
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
  });
});
