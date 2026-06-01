import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useQaUserList } from '../useSharedData';

function wrapper({ children }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useQaUserList', () => {
  beforeEach(() => {
    const body = JSON.stringify([
      { _id: '1', name: 'Alice', role: 'qa' },
      { _id: '2', name: 'Bob', role: 'qa' },
    ]);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => JSON.parse(body),
      text: async () => body,
    });
  });

  it('returns qa user names once resolved', async () => {
    const { result } = renderHook(() => useQaUserList(), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(['Alice', 'Bob']));
  });

  it('returns undefined data before the query resolves', () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useQaUserList(), { wrapper });
    expect(result.current.data).toBeUndefined();
  });
});
