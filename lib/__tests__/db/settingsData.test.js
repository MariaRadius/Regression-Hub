import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';
import { getTeamSettings } from '@/lib/db/settingsData';

const TEAM = 'team-1';
const { db, collections, reset } = createMockDb();

beforeEach(() => reset());

describe('getTeamSettings', () => {
  it('throws when teamId is falsy', async () => {
    await expect(getTeamSettings(db, '')).rejects.toThrow('teamId required');
  });

  it('returns qaUsers from active users', async () => {
    collections.users = {
      find: vi.fn(() => ({
        sort: vi.fn(() => ({
          toArray: vi
            .fn()
            .mockResolvedValue([{ name: 'Alice' }, { name: 'Bob' }]),
        })),
      })),
    };

    const settings = await getTeamSettings(db, TEAM);

    expect(settings).toEqual({
      qaUsers: ['Alice', 'Bob'],
    });
  });
});
