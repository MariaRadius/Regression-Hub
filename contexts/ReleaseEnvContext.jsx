'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

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
 * Persists the active (releaseId, environment) pair to sessionStorage.
 *
 * @param {string} releaseId
 * @param {string} environment
 */
function writeSessionStorage(releaseId, environment) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ releaseId, environment }),
    );
  } catch {
    // sessionStorage unavailable — silently ignore
  }
}

/**
 * Resolves the initial active release + environment from:
 * 1. A valid stored session-storage context (validated against `releases`).
 * 2. An SSR seed object `{ releaseId, environment }` validated the same way.
 * 3. Fallback: the first (newest) non-archived release and its first environment.
 *
 * @param {object[]} releases
 * @param {{ releaseId?: string, environment?: string }|null} ssrSeed
 * @returns {{ release: object|null, environment: string|null }}
 */
function resolveInitial(releases, ssrSeed) {
  const nonArchived = releases?.filter((r) => !r.archived) ?? [];

  // Try sessionStorage first (client-only — will be null on SSR)
  const stored = readSessionStorage(nonArchived);
  if (stored) {
    const release = nonArchived.find((r) => r._id === stored.releaseId) ?? null;
    if (release) return { release, environment: stored.environment };
  }

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
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setRelease = useCallback((release) => {
    if (!release) return;
    const firstEnv = release.environments?.[0] ?? null;
    setActiveRelease(release);
    setEnvironmentState(firstEnv);
    writeSessionStorage(release._id, firstEnv);
  }, []);

  const setEnvironment = useCallback(
    (env) => {
      if (!env || !activeRelease) return;
      if (!activeRelease.environments?.includes(env)) return;
      setEnvironmentState(env);
      writeSessionStorage(activeRelease._id, env);
    },
    [activeRelease],
  );

  const value = useMemo(
    () => ({
      releaseId: activeRelease?._id ?? null,
      releaseName: activeRelease?.name ?? null,
      environments: activeRelease?.environments ?? [],
      environment,
      activeRelease,
      setRelease,
      setEnvironment,
    }),
    [activeRelease, environment, setRelease, setEnvironment],
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
 *   setRelease: (release: object) => void,
 *   setEnvironment: (env: string) => void,
 * }}
 */
export function useReleaseEnv() {
  const ctx = useContext(ReleaseEnvContext);
  if (!ctx) {
    throw new Error('useReleaseEnv must be used inside ReleaseEnvProvider');
  }
  return ctx;
}
