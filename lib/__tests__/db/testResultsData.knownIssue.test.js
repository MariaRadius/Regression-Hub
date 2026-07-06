import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUDIT_ACTION, STATUS } from '@/lib/constants';
import { recordResult } from '@/lib/db/testResultsData';

const appendEvent = vi.hoisted(() => vi.fn());
vi.mock('@/lib/db/eventsData', () => ({ appendEvent }));

const findOne = vi.fn();
const updateOne = vi.fn();
const db = { collection: vi.fn(() => ({ findOne, updateOne })) };

const base = ['t1', 'rel1', 'tc1', 'QA'];

beforeEach(() => {
  vi.clearAllMocks();
  updateOne.mockResolvedValue({ matchedCount: 1 });
  // Current row is a Fail with a linked Test Issue — the auto-fetch source.
  findOne.mockResolvedValue({ status: STATUS.FAIL, jiraIssueKeys: ['RXR-42'] });
});

describe('recordResult — Known Issue', () => {
  it('auto-fetches the linked Jira key from the failed row (no manual key)', async () => {
    await recordResult(db, ...base, {
      status: STATUS.KNOWN_ISSUE,
      testedBy: 'Alice',
      notes: 'accepted defect',
    });

    const [filter, update] = updateOne.mock.calls[0];
    expect(filter).toEqual({
      teamId: 't1',
      releaseId: 'rel1',
      tcId: 'tc1',
      environment: 'QA',
    });
    expect(update.$set.status).toBe(STATUS.KNOWN_ISSUE);
    expect(update.$set.testedBy).toBe('Alice');
    // Resolved from the row's existing keys; $addToSet keeps them linked.
    expect(update.$addToSet.jiraIssueKeys).toEqual({ $each: ['RXR-42'] });

    const event = appendEvent.mock.calls[0][2];
    expect(event.action).toBe(AUDIT_ACTION.KNOWN_ISSUE);
    expect(event.jiraKey).toBe('RXR-42');
  });

  it('falls back to a supplied Jira key when the failure has none linked', async () => {
    findOne.mockResolvedValue({ status: STATUS.FAIL, jiraIssueKeys: [] });

    await recordResult(db, ...base, {
      status: STATUS.KNOWN_ISSUE,
      testedBy: 'Alice',
      jiraKey: 'RXR-99',
    });

    const [, update] = updateOne.mock.calls[0];
    expect(update.$addToSet.jiraIssueKeys).toEqual({ $each: ['RXR-99'] });
    expect(appendEvent.mock.calls[0][2].jiraKey).toBe('RXR-99');
  });

  it('rejects when nothing is linked and no key is supplied', async () => {
    findOne.mockResolvedValue({ status: STATUS.FAIL, jiraIssueKeys: [] });
    await expect(
      recordResult(db, ...base, {
        status: STATUS.KNOWN_ISSUE,
        testedBy: 'Alice',
      }),
    ).rejects.toThrow(/No Jira issue is linked/);
    expect(updateOne).not.toHaveBeenCalled();
  });

  it('rejects an invalid fallback key', async () => {
    findOne.mockResolvedValue({ status: STATUS.FAIL, jiraIssueKeys: [] });
    await expect(
      recordResult(db, ...base, {
        status: STATUS.KNOWN_ISSUE,
        testedBy: 'Alice',
        jiraKey: 'not-a-key',
      }),
    ).rejects.toThrow(/No Jira issue is linked/);
    expect(updateOne).not.toHaveBeenCalled();
  });

  it('rejects when the current row is not Fail', async () => {
    findOne.mockResolvedValue({
      status: STATUS.PASS,
      jiraIssueKeys: ['RXR-42'],
    });
    await expect(
      recordResult(db, ...base, {
        status: STATUS.KNOWN_ISSUE,
        testedBy: 'Alice',
      }),
    ).rejects.toThrow(/failed test/);
    expect(updateOne).not.toHaveBeenCalled();
  });

  it('requires a tester', async () => {
    await expect(
      recordResult(db, ...base, {
        status: STATUS.KNOWN_ISSUE,
      }),
    ).rejects.toThrow(/testedBy is required/);
    expect(updateOne).not.toHaveBeenCalled();
  });
});
