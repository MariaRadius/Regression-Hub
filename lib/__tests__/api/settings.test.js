import { mockFetch } from '@/lib/__tests__/helpers/mockFetch';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { showToast } = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('@/components/Toast', () => ({ showToast }));

import { getSettings, putSettings } from '@/lib/api/settings';

beforeEach(() => {
  showToast.mockClear();
  vi.stubGlobal(
    'fetch',
    mockFetch({
      'GET /api/settings': {
        json: { qaUsers: ['A'], testEnvironment: 'QA', softwareVersion: '1.0' },
      },
      'PUT /api/settings': { json: { ok: true } },
    })
  );
});

describe('settings api', () => {
  it('getSettings returns parsed settings', async () => {
    const data = await getSettings();
    expect(data.qaUsers).toEqual(['A']);
  });

  it('putSettings sends body and returns ok', async () => {
    const data = await putSettings({ softwareVersion: '2.0' });
    expect(data).toEqual({ ok: true });
  });
});
