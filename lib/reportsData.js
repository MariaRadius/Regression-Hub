import { getVersions } from '@/lib/versionsData';
import { getDashboardData } from '@/lib/dashboardData';
import { getTeamSettings } from '@/lib/settingsData';
import { getApplications } from '@/lib/applicationsData';

export async function getReportsPageData({ teamId, applicationId = '' }) {
  if (!teamId) throw new Error('teamId required');
  const [versions, dashboard, settings, applications] = await Promise.all([
    getVersions({ teamId }),
    getDashboardData({ teamId, applicationId }),
    getTeamSettings({ teamId }),
    getApplications({ teamId }),
  ]);
  return {
    versions,
    summary: dashboard.summary,
    settings: {
      testEnvironment: settings.testEnvironment ?? '',
      softwareVersion: settings.softwareVersion ?? '',
    },
    applications,
  };
}
