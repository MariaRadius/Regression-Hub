import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockFetch } from '@/lib/__tests__/helpers/mockFetch';

vi.mock('@/components/Toast', () => ({ showToast: vi.fn() }));

import { getSettings, updateAdminSettings } from '@/lib/api/settings';

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    mockFetch({
      'GET /api/settings': {
        json: { qaUsers: ['A'], failureThreshold: 10, topModulesLimit: 3 },
      },
      'PATCH /api/admin/settings': {
        json: { ok: true },
      },
    }),
  );
});

describe('settings api', () => {
  it('getSettings returns parsed settings including thresholds', async () => {
    const data = await getSettings();
    expect(data.qaUsers).toEqual(['A']);
    expect(data.failureThreshold).toBe(10);
    expect(data.topModulesLimit).toBe(3);
  });

  it('updateAdminSettings calls PATCH and returns ok', async () => {
    const data = await updateAdminSettings({ failureThreshold: 10 });
    expect(data).toEqual({ ok: true });
  });
});
