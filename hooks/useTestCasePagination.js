'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';

export const PAGE_SIZE_OPTIONS = [10, 50, 100];
export const DEFAULT_PAGE = 1;
export const DEFAULT_SIZE = 50;

/**
 * @see app/(app)/test-cases/master-detail/TestCasePagination.jsx
 *
 * Page + page-size state with URL persistence. Defaults (page=1, size=50)
 * are omitted from the URL. Any external setter resets page to 1 should be
 * called by the consumer when filters change (this hook does not own filters).
 */
export function useTestCasePagination() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const [page, setPageState] = useState(() => {
    const v = parseInt(searchParams.get('page') || '', 10);
    return Number.isFinite(v) && v > 0 ? v : DEFAULT_PAGE;
  });
  const [size, setSizeState] = useState(() => {
    const v = parseInt(searchParams.get('size') || '', 10);
    return PAGE_SIZE_OPTIONS.includes(v) ? v : DEFAULT_SIZE;
  });

  const writeUrl = useCallback(
    (nextPage, nextSize) => {
      const params = new URLSearchParams(searchParams.toString());
      if (nextPage === DEFAULT_PAGE) params.delete('page');
      else params.set('page', String(nextPage));
      if (nextSize === DEFAULT_SIZE) params.delete('size');
      else params.set('size', String(nextSize));
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const setPage = useCallback(
    (next) => {
      setPageState(next);
      writeUrl(next, size);
    },
    [size, writeUrl],
  );

  const setSize = useCallback(
    (next) => {
      setSizeState(next);
      setPageState(DEFAULT_PAGE);
      writeUrl(DEFAULT_PAGE, next);
    },
    [writeUrl],
  );

  return { page, size, setPage, setSize, PAGE_SIZE_OPTIONS };
}
