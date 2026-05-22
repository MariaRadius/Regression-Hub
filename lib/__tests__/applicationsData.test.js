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

import { getApplications } from '@/lib/applicationsData';

const TEAM = 'team-1';

beforeEach(() => {
  resetCollections();
});

describe('getApplications', () => {
  it('throws when teamId is falsy', async () => {
    await expect(getApplications({ teamId: '' })).rejects.toThrow('teamId required');
  });

  it('returns applications with string _id sorted by name', async () => {
    const toArray = vi.fn().mockResolvedValue([
      { _id: { toString: () => 'app-b' }, name: 'Beta', teamId: TEAM },
      { _id: { toString: () => 'app-a' }, name: 'Alpha', teamId: TEAM },
    ]);
    collections.applications = {
      find: vi.fn(() => ({ sort: vi.fn(() => ({ toArray })) })),
    };

    const apps = await getApplications({ teamId: TEAM });

    expect(collections.applications.find).toHaveBeenCalledWith({ teamId: TEAM });
    expect(apps).toEqual([
      { _id: 'app-b', name: 'Beta', teamId: TEAM },
      { _id: 'app-a', name: 'Alpha', teamId: TEAM },
    ]);
  });

  it('propagates getDb failures', async () => {
    getDb.mockRejectedValueOnce(new Error('connection lost'));
    await expect(getApplications({ teamId: TEAM })).rejects.toThrow('connection lost');
  });
});
