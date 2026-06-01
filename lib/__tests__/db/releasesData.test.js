import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectApiError } from '@/lib/__tests__/helpers/expectApiError';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';
import { createRelease, updateRelease } from '@/lib/db/releasesData';

const TEAM = 'team-1';
const RELEASE_ID = 'rel-abc';

const { db, collections, reset } = createMockDb();

beforeEach(() => {
  reset();
  // Default releases collection — findOne returns null (no conflicts), write ops are spied on.
  collections.releases = {
    findOne: vi.fn().mockResolvedValue(null),
    insertOne: vi.fn().mockResolvedValue({}),
    updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
  };
  // events collection required by appendEvent
  collections.events = {
    insertMany: vi.fn().mockResolvedValue({}),
  };
});

describe('createRelease', () => {
  it('rejects a name containing "/" with ApiError 400 before any DB write', async () => {
    await expectApiError(
      createRelease(db, TEAM, { name: '2.10/rc', environments: ['QA'] }),
      { status: 400, message: 'Release name cannot contain "/"' },
    );
    expect(collections.releases.insertOne).not.toHaveBeenCalled();
  });

  it('rejects an environment containing "/" with ApiError 400 before any DB write', async () => {
    await expectApiError(
      createRelease(db, TEAM, { name: '2.10.0', environments: ['QA/Staging'] }),
      { status: 400, message: 'Environment cannot contain "/"' },
    );
    expect(collections.releases.insertOne).not.toHaveBeenCalled();
  });
});

describe('updateRelease', () => {
  beforeEach(() => {
    // requireRelease must find an existing non-archived release
    collections.releases.findOne = vi.fn().mockResolvedValue({
      _id: RELEASE_ID,
      teamId: TEAM,
      name: '2.9.0',
      environments: ['QA'],
      archived: false,
    });
  });

  it('rejects a renamed "/" name with ApiError 400 before any DB write', async () => {
    await expectApiError(
      updateRelease(db, TEAM, RELEASE_ID, { name: '2.10/rc' }),
      { status: 400, message: 'Release name cannot contain "/"' },
    );
    expect(collections.releases.updateOne).not.toHaveBeenCalled();
  });
});
