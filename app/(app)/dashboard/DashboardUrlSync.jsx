'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { useReleaseEnv } from '@/contexts/ReleaseEnvContext';

/**
 * Syncs the sessionStorage working context (releaseId + environment from
 * ReleaseEnvContext) into the URL search params so the RSC dashboard page can
 * read the active selection server-side on every router.refresh().
 *
 * Renders nothing — side-effect only.
 */
export default function DashboardUrlSync() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { releaseId, environment } = useReleaseEnv();

  useEffect(() => {
    if (!releaseId || !environment) return;

    const currentReleaseId = searchParams.get('releaseId');
    const currentEnvironment = searchParams.get('environment');

    if (currentReleaseId === releaseId && currentEnvironment === environment) {
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    params.set('releaseId', releaseId);
    params.set('environment', environment);
    router.replace(`/dashboard?${params.toString()}`);
  }, [releaseId, environment, searchParams, router]);

  return null;
}
