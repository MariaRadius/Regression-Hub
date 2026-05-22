import { createMockDb } from '@/lib/__tests__/helpers/mockDb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { db, reset } = createMockDb();
const { listModules, createModule } = vi.hoisted(() => ({
  listModules: vi.fn(),
  createModule: vi.fn(),
}));

vi.mock('@/lib/server/withTeam', () => ({
  withTeam: (handler) => (req, ctx) =>
    handler(req, ctx, {
      session: { user: { teamId: 't1', name: 'User' } },
      teamId: 't1',
      db,
    }),
  withAdmin: (handler) => (req, ctx) =>
    handler(req, ctx, {
      session: { user: { teamId: 't1', role: 'admin' } },
      teamId: 't1',
      db,
    }),
}));

vi.mock('@/lib/db/modulesData', () => ({ listModules, createModule }));

import { GET, POST } from '../route';

beforeEach(() => {
  reset();
  vi.clearAllMocks();
});

describe('GET /api/modules', () => {
  it('returns module list', async () => {
    listModules.mockResolvedValue([
      { _id: 'm1', name: 'Mod', applicationName: 'App' },
    ]);
    const res = await GET(new Request('http://x/api/modules'));
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveLength(1);
    expect(listModules).toHaveBeenCalledWith(db, 't1', { applicationId: '' });
  });
});

describe('POST /api/modules', () => {
  it('creates a module', async () => {
    createModule.mockResolvedValue({
      _id: 'm1',
      name: 'New',
      applicationId: 'a1',
      applicationName: 'App',
    });
    const req = new Request('http://x', {
      method: 'POST',
      body: JSON.stringify({ name: 'New', applicationId: 'a1' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(createModule).toHaveBeenCalledWith(db, 't1', {
      name: 'New',
      applicationId: 'a1',
    });
  });
});
