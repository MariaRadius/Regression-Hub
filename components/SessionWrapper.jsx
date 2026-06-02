'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/queryClient';

/** @see {@link __tests__/SessionWrapper.test.jsx} */
export default function SessionWrapper({ children }) {
  const queryClient = getQueryClient();
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
