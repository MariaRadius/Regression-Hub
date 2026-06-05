import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AuthHistoryGuard from '../AuthHistoryGuard';

describe('AuthHistoryGuard', () => {
  const originalGetEntriesByType = window.performance.getEntriesByType.bind(
    window.performance,
  );
  const reload = vi.fn();

  beforeEach(() => {
    reload.mockReset();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...window.location,
        reload,
      },
    });
    window.performance.getEntriesByType = vi.fn(() => []);
  });

  afterEach(() => {
    window.performance.getEntriesByType = originalGetEntriesByType;
  });

  it('reloads immediately when mounted from back-forward navigation', () => {
    window.performance.getEntriesByType = vi.fn(() => [
      { type: 'back_forward' },
    ]);

    render(<AuthHistoryGuard />);

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads when a persisted pageshow event restores a cached page', () => {
    render(<AuthHistoryGuard />);

    window.dispatchEvent(
      new PageTransitionEvent('pageshow', { persisted: true }),
    );

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('ignores ordinary fresh page loads', () => {
    window.performance.getEntriesByType = vi.fn(() => [{ type: 'navigate' }]);

    render(<AuthHistoryGuard />);
    window.dispatchEvent(
      new PageTransitionEvent('pageshow', { persisted: false }),
    );

    expect(reload).not.toHaveBeenCalled();
  });
});
