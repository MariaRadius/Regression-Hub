'use client';

import { useQuery } from '@tanstack/react-query';

// ── Shared fetchers ────────────────────────────────────────────────────────

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.json();
}

// ── Settings ───────────────────────────────────────────────────────────────
// staleTime inherited from QueryClient default (60s).
// All pages that call useSettings() share a single in-flight request.
export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => fetchJson('/api/settings'),
    staleTime: 30_000, // re-fetch in background after 30s (version badge stays fresh)
  });
}

// ── Applications ───────────────────────────────────────────────────────────
export function useApplications() {
  return useQuery({
    queryKey: ['applications'],
    queryFn: () => fetchJson('/api/applications'),
    staleTime: 5 * 60_000, // apps rarely change — cache for 5 min
  });
}

// ── Modules ────────────────────────────────────────────────────────────────
export function useModules(applicationId) {
  return useQuery({
    queryKey: ['modules', applicationId ?? 'all'],
    queryFn: () =>
      fetchJson(applicationId ? `/api/modules?applicationId=${applicationId}` : '/api/modules'),
    staleTime: 5 * 60_000,
  });
}

// ── QA Users (from settings.qaUsers) ──────────────────────────────────────
export function useQaUsers() {
  const { data } = useSettings();
  return data?.qaUsers ?? [];
}
