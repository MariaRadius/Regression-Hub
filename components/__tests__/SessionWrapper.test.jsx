import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SessionWrapper from '../SessionWrapper';

const { SessionProvider } = vi.hoisted(() => ({
  SessionProvider: vi.fn(({ children }) => <>{children}</>),
}));

vi.mock('next-auth/react', () => ({
  SessionProvider,
}));

vi.mock('@tanstack/react-query', () => ({
  QueryClientProvider: ({ children }) => <>{children}</>,
}));

vi.mock('@/lib/queryClient', () => ({
  getQueryClient: vi.fn(() => ({})),
}));

describe('SessionWrapper', () => {
  it('does not mount a client session provider', () => {
    render(
      <SessionWrapper>
        <p>child content</p>
      </SessionWrapper>,
    );

    expect(SessionProvider).not.toHaveBeenCalled();
  });

  it('renders children', () => {
    render(
      <SessionWrapper>
        <p>child content</p>
      </SessionWrapper>,
    );
    expect(screen.getByText('child content')).toBeInTheDocument();
  });

  it('renders multiple children', () => {
    render(
      <SessionWrapper>
        <span>first</span>
        <span>second</span>
      </SessionWrapper>,
    );
    expect(screen.getByText('first')).toBeInTheDocument();
    expect(screen.getByText('second')).toBeInTheDocument();
  });
});
