import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';
import { getTeamSettings, updateTeamSettings } from '@/lib/db/settingsData';

const TEAM = 'team-1';
const { db, collections, reset } = createMockDb();

function mockUsers(names = []) {
  collections.users = {
    find: vi.fn(() => ({
      sort: vi.fn(() => ({
        toArray: vi.fn().mockResolvedValue(names.map((name) => ({ name }))),
      })),
    })),
  };
}

function mockSettingsDoc(doc = null) {
  collections.settings = {
    findOne: vi.fn().mockResolvedValue(doc),
    updateOne: vi.fn().mockResolvedValue({ acknowledged: true }),
  };
}

beforeEach(() => reset());

describe('getTeamSettings', () => {
  it('throws when teamId is falsy', async () => {
    await expect(getTeamSettings(db, '')).rejects.toThrow('teamId required');
  });

  it('returns qaUsers and default thresholds when no settings doc exists', async () => {
    mockUsers(['Alice', 'Bob']);
    mockSettingsDoc(null);

    const settings = await getTeamSettings(db, TEAM);

    expect(settings.qaUsers).toEqual(['Alice', 'Bob']);
    expect(settings.failureThreshold).toBe(5);
    expect(settings.topModulesLimit).toBe(5);
  });

  it('returns stored thresholds when settings doc exists', async () => {
    mockUsers(['Alice']);
    mockSettingsDoc({ teamId: TEAM, failureThreshold: 10, topModulesLimit: 3 });

    const settings = await getTeamSettings(db, TEAM);

    expect(settings.failureThreshold).toBe(10);
    expect(settings.topModulesLimit).toBe(3);
  });
});

describe('updateTeamSettings', () => {
  it('throws when teamId is falsy', async () => {
    await expect(updateTeamSettings(db, '', {})).rejects.toThrow(
      'teamId required',
    );
  });

  it('upserts settings document', async () => {
    mockSettingsDoc();
    await updateTeamSettings(db, TEAM, { failureThreshold: 8 });
    expect(collections.settings.updateOne).toHaveBeenCalledWith(
      { teamId: TEAM },
      expect.objectContaining({
        $set: expect.objectContaining({ failureThreshold: 8, teamId: TEAM }),
      }),
      { upsert: true },
    );
  });
});
