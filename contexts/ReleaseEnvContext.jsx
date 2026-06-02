'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { serializeReleaseCtxCookie } from '@/lib/releaseCtx';

const SESSION_KEY = 'rh_release_ctx';

const ReleaseEnvContext = createContext(null);

/**
 * Returns the stored session context, validated against the given releases list.
 * Falls back to null if the stored release is missing, archived, or has an
 * environment that no longer exists on that release.
 *
 * @param {object[]|null} releases - Non-archived releases available to the user.
 * @returns {{ releaseId: string, environment: string }|null}
 */
function readSessionStorage(releases) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.releaseId || !parsed?.environment) return null;

    const release = releases?.find((r) => r._id === parsed.releaseId);
    if (!release || release.archived) return null;
    if (!release.environments?.includes(parsed.environment)) return null;

    return { releaseId: parsed.releaseId, environment: parsed.environment };
  } catch {
    return null;
  }
}

/**
 * Persists the active (releaseId, environment) pair to both sessionStorage (the
 * per-tab working copy) and the release-context cookie (the per-browser,
 * server-readable mirror that RSC pages read instead of URL params).
 *
 * Writes synchronously so a caller can `router.refresh()` immediately after and
 * have the server re-read the fresh cookie.
 *
 * @param {string} releaseId
 * @param {string} environment
 */
function persistReleaseCtx(releaseId, environment) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ releaseId, environment }),
    );
  } catch {
    // sessionStorage unavailable — silently ignore
  }
  try {
    document.cookie = serializeReleaseCtxCookie(releaseId, environment);
  } catch {
    // cookie write unavailable — silently ignore
  }
}

/**
 * Resolves the initial active release + environment from:
 * 1. An SSR seed object `{ releaseId, environment }` validated against `releases`.
 * 2. Fallback: the first (newest) non-archived release and its first environment.
 *
 * Deliberately does NOT read sessionStorage: initial state must be identical on
 * server and client to avoid a hydration mismatch. The stored context is applied
 * after mount by the provider's hydration-guard effect.
 *
 * @param {object[]} releases
 * @param {{ releaseId?: string, environment?: string }|null} ssrSeed
 * @returns {{ release: object|null, environment: string|null }}
 */
function resolveInitial(releases, ssrSeed) {
  const nonArchived = releases?.filter((r) => !r.archived) ?? [];

  // Try SSR seed
  if (ssrSeed?.releaseId && ssrSeed?.environment) {
    const release =
      nonArchived.find((r) => r._id === ssrSeed.releaseId) ?? null;
    if (release?.environments?.includes(ssrSeed.environment)) {
      return { release, environment: ssrSeed.environment };
    }
  }

  // Fallback: newest non-archived + its first env
  const fallbackRelease = nonArchived[0] ?? null;
  const fallbackEnv = fallbackRelease?.environments?.[0] ?? null;
  return { release: fallbackRelease, environment: fallbackEnv };
}

/**
 * Provides the app-wide (Release, Environment) working context.
 *
 * @param {{
 *   children: React.ReactNode,
 *   releases: object[],
 *   ssrSeed?: { releaseId?: string, environment?: string }|null,
 * }} props
 */
export function ReleaseEnvProvider({
  children,
  releases = [],
  ssrSeed = null,
}) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally stable — resolved once on mount from SSR props
  const initial = useMemo(
    () => resolveInitial(releases, ssrSeed),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const [activeRelease, setActiveRelease] = useState(initial.release);
  const [environment, setEnvironmentState] = useState(initial.environment);

  // On mount, re-validate against sessionStorage (hydration guard)
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally runs once — reads stable SSR prop snapshot for hydration guard
  useEffect(() => {
    const stored = readSessionStorage(
      releases?.filter((r) => !r.archived) ?? [],
    );
    if (stored) {
      const release = releases.find((r) => r._id === stored.releaseId) ?? null;
      if (release) {
        setActiveRelease(release);
        setEnvironmentState(stored.environment);
        // Re-seed the server-readable cookie from this tab's sessionStorage so a
        // fresh tab (empty cookie) and any router.refresh() converge on the same
        // selection the server rendered against.
        persistReleaseCtx(stored.releaseId, stored.environment);
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setReleaseEnv = useCallback((release, env) => {
    if (!release || !env) return;
    if (!release.environments?.includes(env)) return;
    setActiveRelease(release);
    setEnvironmentState(env);
    persistReleaseCtx(release._id, env);
  }, []);

  const value = useMemo(
    () => ({
      releaseId: activeRelease?._id ?? null,
      releaseName: activeRelease?.name ?? null,
      environments: activeRelease?.environments ?? [],
      environment,
      activeRelease,
      releases,
      setReleaseEnv,
    }),
    [releases, activeRelease, environment, setReleaseEnv],
  );

  return (
    <ReleaseEnvContext.Provider value={value}>
      {children}
    </ReleaseEnvContext.Provider>
  );
}

/**
 * Returns the active (Release, Environment) context.
 * Must be used inside a ReleaseEnvProvider.
 *
 * @returns {{
 *   releaseId: string|null,
 *   releaseName: string|null,
 *   environments: string[],
 *   environment: string|null,
 *   activeRelease: object|null,
 *   releases: object[],
 *   setReleaseEnv: (release: object, env: string) => void,
 * }}
 */
export function useReleaseEnv() {
  const ctx = useContext(ReleaseEnvContext);
  if (!ctx) {
    throw new Error('useReleaseEnv must be used inside ReleaseEnvProvider');
  }
  return ctx;
}
