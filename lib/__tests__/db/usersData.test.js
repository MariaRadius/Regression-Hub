import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';
import { createUser, getUsers, updateUser } from '@/lib/db/usersData';

const { appendAdminActivity } = vi.hoisted(() => ({
  appendAdminActivity: vi.fn(),
}));

vi.mock('@/lib/db/adminActivityData', () => ({
  appendAdminActivity,
}));

const TEAM = 'team-1';
const { db, collections, reset } = createMockDb();

beforeEach(() => reset());

describe('getUsers', () => {
  it('throws when teamId is falsy', async () => {
    await expect(getUsers(db, '')).rejects.toThrow('teamId required');
  });

  it('returns users without passwordHash and string _id', async () => {
    const find = vi.fn(() => ({
      sort: vi.fn(() => ({
        toArray: vi
          .fn()
          .mockResolvedValue([
            { _id: { toString: () => 'u1' }, name: 'Alice', role: 'qa' },
          ]),
      })),
    }));
    collections.users = {
      find,
    };
    const users = await getUsers(db, TEAM);
    expect(users).toEqual([{ _id: 'u1', name: 'Alice', role: 'qa' }]);
    expect(users[0]).not.toHaveProperty('passwordHash');
    expect(find).toHaveBeenCalledWith(
      { teamId: TEAM },
      { projection: { passwordHash: 0 } },
    );
  });

  it('applies optional role and active filters', async () => {
    const find = vi.fn(() => ({
      sort: vi.fn(() => ({
        toArray: vi.fn().mockResolvedValue([]),
      })),
    }));
    collections.users = {
      find,
    };

    await getUsers(db, TEAM, { role: 'qa', active: true });

    expect(find).toHaveBeenCalledWith(
      { teamId: TEAM, role: 'qa', active: true },
      { projection: { passwordHash: 0 } },
    );
  });
});

describe('createUser', () => {
  it('appends an admin activity event after user creation', async () => {
    collections.users = {
      findOne: vi.fn().mockResolvedValue(null),
      insertOne: vi.fn().mockResolvedValue({
        insertedId: { toString: () => 'u2' },
      }),
    };

    const result = await createUser(
      db,
      TEAM,
      {
        name: 'Ammad',
        username: 'ammad',
        password: 'password123',
        role: 'qa',
      },
      { createdBy: 'maria', teamName: 'Radius', actor: 'Maria' },
    );

    expect(result).toEqual({ ok: true, id: 'u2' });
    expect(appendAdminActivity).toHaveBeenCalledWith(
      db,
      TEAM,
      expect.objectContaining({
        category: 'user',
        action: 'create',
        by: 'Maria',
        targetUserName: 'Ammad',
        targetUsername: 'ammad',
      }),
    );
  });
});

describe('updateUser', () => {
  it('appends an admin activity event describing the updated fields', async () => {
    collections.users = {
      findOne: vi.fn().mockResolvedValue({
        _id: { toString: () => 'u2' },
        teamId: TEAM,
        name: 'Ammad',
        role: 'qa',
        active: true,
      }),
      updateOne: vi.fn().mockResolvedValue({ matchedCount: 1 }),
    };

    await updateUser(
      db,
      TEAM,
      '507f191e810c19729de860ea',
      { role: 'admin', active: false },
      { sessionUserId: 'u1', actor: 'Maria' },
    );

    expect(appendAdminActivity).toHaveBeenCalledWith(
      db,
      TEAM,
      expect.objectContaining({
        category: 'user',
        by: 'Maria',
        targetUserName: 'Ammad',
        changes: expect.arrayContaining([
          expect.objectContaining({
            label: 'Role',
            before: 'qa',
            after: 'admin',
          }),
          expect.objectContaining({
            label: 'Status',
            before: 'Active',
            after: 'Inactive',
          }),
        ]),
      }),
    );
  });
});
