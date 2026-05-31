'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FILTER_TYPES } from '@/lib/constants';

// Allowed URL keys (matches FILTER_TYPES keys exactly).
const ALLOWED_KEYS = new Set(FILTER_TYPES.map((f) => f.key));

/**
 * @see app/(app)/test-cases/master-detail/FilterStrip.jsx
 *
 * Bidirectional URL ↔ state sync for the test cases filter strip.
 * - Reads URL params on mount (and only on mount — not on URL change).
 * - Writes URL params via router.replace after each `setActive` call
 *   (via effect, not inside the setState updater — updaters must be pure).
 * - Values are stored as plain strings; comma-separated strings represent OR.
 */
export function useTestCaseFilters() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const [active, setActiveState] = useState(() => {
    const next = {};
    FILTER_TYPES.forEach((f) => {
      const v = searchParams.get(f.key);
      if (v) next[f.key] = v;
    });
    return next;
  });

  // Reads window.location.search at call-time (not a captured searchParams
  // snapshot) so this callback doesn't depend on searchParams and won't
  // change when router.replace updates the URL — prevents effect re-fire loop.
  const writeUrl = useCallback(
    (nextActive) => {
      const params = new URLSearchParams(window.location.search);
      // Strip all filter keys, then re-add only the active ones.
      for (const k of ALLOWED_KEYS) params.delete(k);
      Object.entries(nextActive).forEach(([k, v]) => {
        if (v !== null && v !== undefined && v !== '') params.set(k, v);
      });
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router],
  );

  // Pure state updater — no side effects inside setState.
  // (Calling router.replace inside a setState updater triggers the React
  // "Cannot update a component while rendering a different component" error
  // because updaters run during reconciliation.)
  const setActive = useCallback(
    (updater) =>
      setActiveState((prev) =>
        typeof updater === 'function' ? updater(prev) : updater,
      ),
    [],
  );

  // Write URL after state has settled. Skips the initial mount because the
  // URL already reflects the state we read in the useState initializer above.
  const isMount = useRef(true);
  useEffect(() => {
    if (isMount.current) {
      isMount.current = false;
      return;
    }
    writeUrl(active);
  }, [active, writeUrl]);

  const setFilter = useCallback(
    (key, value) => {
      setActive((prev) => {
        const next = { ...prev };
        if (value === null || value === undefined || value === '')
          delete next[key];
        else next[key] = value;
        return next;
      });
    },
    [setActive],
  );

  const removeFilter = useCallback((key) => setFilter(key, null), [setFilter]);

  const clearAll = useCallback(() => setActive({}), [setActive]);

  // Comma-OR helpers for view-preset toggles.
  const valuesOf = useCallback(
    (key) => (active[key] ? String(active[key]).split(',') : []),
    [active],
  );

  const toggleValue = useCallback(
    (key, value) => {
      setActive((prev) => {
        const vals = prev[key] ? String(prev[key]).split(',') : [];
        const idx = vals.indexOf(value);
        if (idx >= 0) vals.splice(idx, 1);
        else vals.push(value);
        const next = { ...prev };
        if (vals.length === 0) delete next[key];
        else next[key] = vals.join(',');
        return next;
      });
    },
    [setActive],
  );

  return {
    active,
    setActive,
    setFilter,
    removeFilter,
    clearAll,
    valuesOf,
    toggleValue,
  };
}
