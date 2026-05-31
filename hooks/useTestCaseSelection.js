'use client';
import { useCallback, useMemo, useState } from 'react';

/**
 * @see app/(app)/test-cases/master-detail/TestCaseList.jsx
 *
 * Set-based row selection with master-toggle support. Selection is local
 * (not URL-persisted) — it doesn't survive reload, which matches Gmail/TestRail.
 */
export function useTestCaseSelection(pageIds) {
  const [selected, setSelected] = useState(() => new Set());

  const toggleOne = useCallback((id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(
    (checked) => {
      setSelected((prev) => {
        if (checked) return new Set(pageIds);
        // Only clear ids visible on this page; keep any cross-page selections.
        const next = new Set(prev);
        for (const id of pageIds) next.delete(id);
        return next;
      });
    },
    [pageIds],
  );

  const clear = useCallback(() => setSelected(new Set()), []);

  const { allOnPage, someOnPage } = useMemo(() => {
    if (pageIds.length === 0) return { allOnPage: false, someOnPage: false };
    let count = 0;
    pageIds.forEach((id) => {
      if (selected.has(id)) count++;
    });
    return {
      allOnPage: count === pageIds.length,
      someOnPage: count > 0 && count < pageIds.length,
    };
  }, [pageIds, selected]);

  return { selected, toggleOne, toggleAll, clear, allOnPage, someOnPage };
}
