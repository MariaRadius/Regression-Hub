import { QueryClient } from '@tanstack/react-query';

// Shared QueryClient — created once, reused across the app.
// staleTime: 60s means cached data is served immediately; background refetch after 60s.
// retry: 1 prevents hammering the server on transient errors.
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        retry: 1,
        refetchOnWindowFocus: true,
      },
    },
  });
}

let browserClient;

export function getQueryClient() {
  if (typeof window === 'undefined') return makeQueryClient();
  if (!browserClient) browserClient = makeQueryClient();
  return browserClient;
}
