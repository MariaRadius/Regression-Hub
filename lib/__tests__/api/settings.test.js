import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockFetch } from '@/lib/__tests__/helpers/mockFetch';

vi.mock('@/components/Toast', () => ({ showToast: vi.fn() }));

import { getSettings } from '@/lib/api/settings';

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    mockFetch({
      'GET /api/settings': {
        json: { qaUsers: ['A'] },
      },
    }),
  );
});

describe('settings api', () => {
  it('getSettings returns parsed settings', async () => {
    const data = await getSettings();
    expect(data.qaUsers).toEqual(['A']);
  });
});
