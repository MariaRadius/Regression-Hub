import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addResultJiraIssue } from '@/lib/db/testResultsData';

const updateOne = vi.fn();
const db = { collection: vi.fn(() => ({ updateOne })) };

beforeEach(() => {
  vi.clearAllMocks();
  updateOne.mockResolvedValue({ matchedCount: 1 });
});

describe('addResultJiraIssue', () => {
  it('appends the Jira key to the row so repeat failures keep every ticket', async () => {
    await addResultJiraIssue(db, 't1', 'rel1', 'tc1', 'QA', 'RXR-5678');

    expect(db.collection).toHaveBeenCalledWith('testResults');
    const [filter, update] = updateOne.mock.calls[0];
    expect(filter).toEqual({
      teamId: 't1',
      releaseId: 'rel1',
      tcId: 'tc1',
      environment: 'QA',
    });
    expect(update.$push.jiraIssueKeys).toBe('RXR-5678');
    expect(update.$set.updatedAt).toBeInstanceOf(Date);
  });

  it('requires teamId', async () => {
    await expect(
      addResultJiraIssue(db, '', 'rel1', 'tc1', 'QA', 'RXR-5678'),
    ).rejects.toThrow(/teamId required/);
    expect(updateOne).not.toHaveBeenCalled();
  });
});
