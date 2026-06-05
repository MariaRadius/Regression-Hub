'use client';

import { useEffect } from 'react';

function isBackForwardNavigation() {
  if (typeof window === 'undefined') return false;
  const [entry] = window.performance.getEntriesByType('navigation');
  return entry?.type === 'back_forward';
}

export default function AuthHistoryGuard() {
  useEffect(() => {
    function reloadForAuthCheck() {
      window.location.reload();
    }

    function handlePageShow(event) {
      if (event.persisted) {
        reloadForAuthCheck();
      }
    }

    if (isBackForwardNavigation()) {
      reloadForAuthCheck();
      return undefined;
    }

    window.addEventListener('pageshow', handlePageShow);

    return () => {
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, []);

  return null;
}
