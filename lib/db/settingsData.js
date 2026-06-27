import {
  DASHBOARD_TOP_FAILING_MODULES_FAILURE_THRESHOLD,
  DASHBOARD_TOP_FAILING_MODULES_LIMIT,
  JIRA_ISSUE_MODE_DEFAULT,
} from '@/lib/constants';

export async function getTeamSettings(db, teamId) {
  if (!teamId) throw new Error('teamId required');
  const [users, settingsDoc] = await Promise.all([
    db
      .collection('users')
      .find({ teamId, active: { $ne: false } }, { projection: { name: 1 } })
      .sort({ name: 1 })
      .toArray(),
    db.collection('settings').findOne({ teamId }),
  ]);
  return {
    qaUsers: users.map((u) => u.name),
    failureThreshold:
      settingsDoc?.failureThreshold ??
      DASHBOARD_TOP_FAILING_MODULES_FAILURE_THRESHOLD,
    topModulesLimit:
      settingsDoc?.topModulesLimit ?? DASHBOARD_TOP_FAILING_MODULES_LIMIT,
    jiraIssueMode: settingsDoc?.jiraIssueMode ?? JIRA_ISSUE_MODE_DEFAULT,
    // Team-level Jira settings (nullable)
    jiraBaseUrl: settingsDoc?.jiraBaseUrl ?? null,
    jiraProjectKey: settingsDoc?.jiraProjectKey ?? null,
    jiraEmail: settingsDoc?.jiraEmail ?? null,
    jiraApiToken: settingsDoc?.jiraApiToken ?? null,
    aiProvider: settingsDoc?.aiProvider ?? null,
    aiApiKey: settingsDoc?.aiApiKey ?? null,
  };
}

export async function updateTeamSettings(db, teamId, patch) {
  if (!teamId) throw new Error('teamId required');
  await db
    .collection('settings')
    .updateOne(
      { teamId },
      { $set: { ...patch, teamId, updatedAt: new Date() } },
      { upsert: true },
    );
}
