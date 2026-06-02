/**
 * Shared (client + server) helpers for the release-context cookie — the
 * server-readable mirror of the client's working (releaseId, environment)
 * selection held in ReleaseEnvContext.
 *
 * RSC pages read it via `next/headers` cookies(); ReleaseEnvContext writes it
 * via `document.cookie`. This lets server components resolve the active
 * selection without URL search params.
 *
 * The value is URL-encoded JSON. It is a session cookie (no max-age) so it
 * mirrors the ephemeral, session-scoped semantics of the sessionStorage copy.
 * Both readers validate the selection against the team's live releases, so a
 * stale value self-heals to the latest release.
 */

export const RELEASE_CTX_COOKIE = 'rh_release_ctx';

/**
 * Builds a `document.cookie` assignment string for the given selection.
 *
 * @param {string} releaseId
 * @param {string} environment
 * @returns {string}
 */
export function serializeReleaseCtxCookie(releaseId, environment) {
  const value = encodeURIComponent(JSON.stringify({ releaseId, environment }));
  return `${RELEASE_CTX_COOKIE}=${value}; path=/; samesite=lax`;
}

/**
 * Parses a raw cookie value into a selection pair, or null when absent/invalid.
 *
 * @param {string|undefined|null} raw - The cookie's raw (URL-encoded JSON) value.
 * @returns {{ releaseId: string, environment: string }|null}
 */
export function parseReleaseCtxCookie(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw));
    if (!parsed?.releaseId || !parsed?.environment) return null;
    return { releaseId: parsed.releaseId, environment: parsed.environment };
  } catch {
    return null;
  }
}
