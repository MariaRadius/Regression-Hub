import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';
import { ROLES } from '@/lib/constants';

const { db, reset } = createMockDb();
const { getUsers, createUser, checkRateLimit, mockSessionUser } = vi.hoisted(
  () => ({
    getUsers: vi.fn(),
    createUser: vi.fn(),
    checkRateLimit: vi.fn(() => ({ ok: true })),
    mockSessionUser: {
      id: 'u1',
      teamId: 't1',
      role: 'admin',
      username: 'admin',
      teamName: 'Radius',
    },
  }),
);

vi.mock('@/lib/server/withTeam', () => ({
  withTeam: (handler) => (_req, _ctx) =>
    handler(_req, _ctx, {
      session: {
        user: mockSessionUser,
      },
      teamId: 't1',
      db,
    }),
  withAdmin: (handler) => (_req, _ctx) =>
    handler(_req, _ctx, {
      session: {
        user: mockSessionUser,
      },
      teamId: 't1',
      db,
    }),
}));

vi.mock('@/lib/db/usersData', () => ({ getUsers, createUser }));
vi.mock('@/lib/rateLimit', () => ({ checkRateLimit }));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { GET, POST } from '../route';

beforeEach(() => {
  reset();
  vi.clearAllMocks();
  Object.assign(mockSessionUser, {
    id: 'u1',
    teamId: 't1',
    role: ROLES.ADMIN,
    name: 'Maria',
    username: 'admin',
    teamName: 'Radius',
  });
});

describe('GET /api/users', () => {
  it('returns users for admin', async () => {
    getUsers.mockResolvedValue([{ _id: 'u1', name: 'A' }]);
    const res = await GET(new Request('http://x/api/users'));
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveLength(1);
    expect(getUsers).toHaveBeenCalledWith(db, 't1');
  });

  it('returns active qa roster for qa users', async () => {
    mockSessionUser.role = ROLES.QA;
    getUsers.mockResolvedValue([
      { _id: 'u2', name: 'QA User', role: ROLES.QA },
    ]);

    const res = await GET(new Request('http://x/api/users?role=qa'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      { _id: 'u2', name: 'QA User', role: ROLES.QA },
    ]);
    expect(getUsers).toHaveBeenCalledWith(db, 't1', {
      role: ROLES.QA,
      active: true,
    });
  });

  it('rejects the full roster for qa users', async () => {
    mockSessionUser.role = ROLES.QA;

    const res = await GET(new Request('http://x/api/users'));

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      error: 'Admin access required',
    });
  });
});

describe('POST /api/users', () => {
  it('creates user', async () => {
    createUser.mockResolvedValue({ ok: true, id: 'new-id' });
    const req = new Request('http://x', {
      method: 'POST',
      body: JSON.stringify({
        name: 'A',
        username: 'a',
        password: 'password1',
        role: 'qa',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(createUser).toHaveBeenCalledWith(
      db,
      't1',
      expect.any(Object),
      expect.objectContaining({
        createdBy: 'admin',
        actor: 'Maria',
      }),
    );
  });
});
