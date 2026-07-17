import { beforeEach, describe, expect, it, vi } from 'vitest';

const { showToast } = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('@/utils/showToast', () => ({ showToast }));

import { toastJiraOutcome } from '@/utils/toastJiraOutcome';

beforeEach(() => {
  showToast.mockClear();
});

describe('toastJiraOutcome', () => {
  it('is a no-op for null/undefined outcomes', () => {
    toastJiraOutcome(null);
    toastJiraOutcome(undefined);
    expect(showToast).not.toHaveBeenCalled();
  });

  it('toasts created keys as success', () => {
    toastJiraOutcome({
      created: [
        { tcId: 'a', key: 'RXR-1' },
        { tcId: 'b', key: 'RXR-2' },
      ],
      skipped: [],
      errors: [],
    });
    expect(showToast).toHaveBeenCalledWith(
      'Created Jira issues RXR-1, RXR-2',
      'success',
    );
  });

  it('toasts skipped cases as info and errors as warnings', () => {
    toastJiraOutcome({
      created: [],
      skipped: [{ tcId: 'a', reason: 'no-linked-story' }],
      errors: [{ tcId: 'b', error: 'auth failed' }],
    });
    expect(showToast).toHaveBeenCalledWith(
      '1 case has no linked Jira Story — no issue created',
      'info',
    );
    expect(showToast).toHaveBeenCalledWith(
      'Result saved, but Jira issue creation failed: auth failed',
      'warning',
    );
  });
});
