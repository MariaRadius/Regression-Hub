'use client';

import { useQuery } from '@tanstack/react-query';
import { listModules } from '@/lib/api/modules';
import { getSettings } from '@/lib/api/settings';
import { get } from '@/lib/http/client';

/**
 * Fetches the active QA users for the team from /api/users?role=qa.
 * Returns the full react-query result; `data` is a string[] of user names.
 *
 * @returns {import('@tanstack/react-query').UseQueryResult<string[]>}
 */
export function useQaUserList() {
  return useQuery({
    queryKey: ['users', 'qa'],
    queryFn: () => get('/api/users?role=qa'),
    staleTime: 30_000,
    select: (data) => (Array.isArray(data) ? data.map((u) => u.name) : []),
  });
}

/**
 * Fetches the team settings from /api/settings — includes `jiraIssueMode`
 * ('off'|'ask'|'auto') and `jiraConfigured` (server has Jira env vars).
 * Used by the Fail dialog to decide whether to show the Jira checkbox.
 *
 * @returns {import('@tanstack/react-query').UseQueryResult<object>}
 */
export function useTeamSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => getSettings(),
    staleTime: 5 * 60_000,
  });
}

export function useModules(applicationId) {
  return useQuery({
    queryKey: ['modules', applicationId ?? 'all'],
    queryFn: () => listModules(applicationId ? { applicationId } : {}),
    staleTime: 5 * 60_000,
  });
}
