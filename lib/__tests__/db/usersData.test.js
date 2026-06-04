import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';
import { getUsers } from '@/lib/db/usersData';

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
