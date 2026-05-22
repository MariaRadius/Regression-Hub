import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  getVersions,
  getDashboardData,
  getTeamSettings,
  getApplications,
} = vi.hoisted(() => ({
  getVersions: vi.fn(),
  getDashboardData: vi.fn(),
  getTeamSettings: vi.fn(),
  getApplications: vi.fn(),
}));

vi.mock('@/lib/versionsData', () => ({ getVersions }));
vi.mock('@/lib/dashboardData', () => ({ getDashboardData }));
vi.mock('@/lib/settingsData', () => ({ getTeamSettings }));
vi.mock('@/lib/applicationsData', () => ({ getApplications }));

import { getReportsPageData } from '@/lib/reportsData';

const TEAM = 'team-1';

beforeEach(() => {
  vi.clearAllMocks();
  getVersions.mockResolvedValue([{ version: '1.0', total: 1 }]);
  getDashboardData.mockResolvedValue({ summary: { total: 10, passed: 8, failed: 1, pending: 1 } });
  getTeamSettings.mockResolvedValue({
    testEnvironment: 'QA',
    softwareVersion: '2.0',
    qaUsers: ['Alice'],
  });
  getApplications.mockResolvedValue([{ _id: 'app-1', name: 'Portal' }]);
});

describe('getReportsPageData', () => {
  it('throws when teamId is falsy', async () => {
    await expect(getReportsPageData({ teamId: '' })).rejects.toThrow('teamId required');
  });

  it('orchestrates lib calls and returns page payload shape', async () => {
    const data = await getReportsPageData({ teamId: TEAM, applicationId: 'app-1' });

    expect(getVersions).toHaveBeenCalledWith({ teamId: TEAM });
    expect(getDashboardData).toHaveBeenCalledWith({ teamId: TEAM, applicationId: 'app-1' });
    expect(getTeamSettings).toHaveBeenCalledWith({ teamId: TEAM });
    expect(getApplications).toHaveBeenCalledWith({ teamId: TEAM });
    expect(data).toEqual({
      versions: [{ version: '1.0', total: 1 }],
      summary: { total: 10, passed: 8, failed: 1, pending: 1 },
      settings: {
        testEnvironment: 'QA',
        softwareVersion: '2.0',
      },
      applications: [{ _id: 'app-1', name: 'Portal' }],
    });
  });

  it('defaults applicationId to empty string for dashboard query', async () => {
    await getReportsPageData({ teamId: TEAM });

    expect(getDashboardData).toHaveBeenCalledWith({ teamId: TEAM, applicationId: '' });
  });

  it('propagates dependency failures from orchestrated calls', async () => {
    getVersions.mockRejectedValueOnce(new Error('versions failed'));
    await expect(getReportsPageData({ teamId: TEAM })).rejects.toThrow('versions failed');
  });

  it('uses empty strings when settings fields are missing', async () => {
    getTeamSettings.mockResolvedValueOnce({ qaUsers: [] });

    const data = await getReportsPageData({ teamId: TEAM });

    expect(data.settings).toEqual({
      testEnvironment: '',
      softwareVersion: '',
    });
  });
});
