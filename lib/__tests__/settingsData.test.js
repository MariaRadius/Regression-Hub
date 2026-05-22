import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getDb, collections, resetCollections } = vi.hoisted(() => {
  const collections = {};

  const getDb = vi.fn(async () => ({
    collection: vi.fn((name) => {
      if (!collections[name]) {
        collections[name] = {};
      }
      return collections[name];
    }),
  }));

  const resetCollections = () => {
    for (const key of Object.keys(collections)) {
      delete collections[key];
    }
    getDb.mockClear();
  };

  return { getDb, collections, resetCollections };
});

vi.mock('@/lib/mongodb', () => ({ getDb }));

import { getTeamSettings, updateTeamSettings } from '@/lib/settingsData';

const TEAM = 'team-1';

beforeEach(() => {
  resetCollections();
});

describe('getTeamSettings', () => {
  it('throws when teamId is falsy', async () => {
    await expect(getTeamSettings({ teamId: '' })).rejects.toThrow('teamId required');
  });

  it('spreads settings fields and maps active users to qaUsers names', async () => {
    collections.teamSettings = {
      findOne: vi.fn().mockResolvedValue({
        testEnvironment: 'Staging',
        softwareVersion: '2.1',
      }),
    };
    collections.users = {
      find: vi.fn(() => ({
        sort: vi.fn(() => ({
          toArray: vi.fn().mockResolvedValue([
            { name: 'Bob' },
            { name: 'Alice' },
          ]),
        })),
      })),
    };

    const settings = await getTeamSettings({ teamId: TEAM });

    expect(settings).toEqual({
      testEnvironment: 'Staging',
      softwareVersion: '2.1',
      qaUsers: ['Bob', 'Alice'],
    });
  });

  it('returns qaUsers only when no team settings document exists', async () => {
    collections.teamSettings = { findOne: vi.fn().mockResolvedValue(null) };
    collections.users = {
      find: vi.fn(() => ({
        sort: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
      })),
    };

    const settings = await getTeamSettings({ teamId: TEAM });
    expect(settings).toEqual({ qaUsers: [] });
  });
});

describe('updateTeamSettings', () => {
  it('throws when teamId is falsy', async () => {
    await expect(updateTeamSettings({ teamId: '', patch: {} }))
      .rejects.toThrow('teamId required');
  });

  it('applies only defined fields from the patch', async () => {
    const updateOne = vi.fn().mockResolvedValue({});
    collections.teamSettings = { updateOne };

    await updateTeamSettings({
      teamId: TEAM,
      patch: { softwareVersion: '3.0' },
    });

    expect(updateOne).toHaveBeenCalledWith(
      { teamId: TEAM },
      expect.objectContaining({
        $set: expect.objectContaining({
          softwareVersion: '3.0',
          updatedAt: expect.any(Date),
        }),
      }),
      { upsert: true }
    );
    const { $set } = updateOne.mock.calls[0][1];
    expect($set).not.toHaveProperty('testEnvironment');
  });

  it('propagates getDb failures', async () => {
    getDb.mockRejectedValueOnce(new Error('db down'));
    await expect(updateTeamSettings({ teamId: TEAM, patch: {} }))
      .rejects.toThrow('db down');
  });
});
