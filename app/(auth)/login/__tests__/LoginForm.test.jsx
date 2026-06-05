'use client';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { signIn } from 'next-auth/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LoginForm from '../LoginForm';

const replace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));

vi.mock('next-auth/react', () => ({
  signIn: vi.fn(),
}));

describe('LoginForm', () => {
  beforeEach(() => {
    replace.mockReset();
    vi.clearAllMocks();
  });

  it('replaces history with the protected destination after a successful sign-in', async () => {
    signIn.mockResolvedValue({ ok: true });

    render(<LoginForm redirectTo='/reports?tab=latest' />);

    await userEvent.type(screen.getByLabelText(/username/i), 'maria');
    await userEvent.type(screen.getByLabelText(/password/i), 'Maria@Radius1');
    await userEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    expect(signIn).toHaveBeenCalledWith('credentials', {
      username: 'maria',
      password: 'Maria@Radius1',
      redirect: false,
    });
    expect(replace).toHaveBeenCalledWith('/reports?tab=latest');
  });

  it('falls back to dashboard when redirectTo is not a safe app path', async () => {
    signIn.mockResolvedValue({ ok: true });

    render(<LoginForm redirectTo='https://example.com/phish' />);

    await userEvent.type(screen.getByLabelText(/username/i), 'maria');
    await userEvent.type(screen.getByLabelText(/password/i), 'Maria@Radius1');
    await userEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    expect(replace).toHaveBeenCalledWith('/dashboard');
  });

  it('shows an error when credentials are rejected', async () => {
    signIn.mockResolvedValue({ error: 'CredentialsSignin' });

    render(<LoginForm redirectTo='/dashboard' />);

    await userEvent.type(screen.getByLabelText(/username/i), 'maria');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    expect(replace).not.toHaveBeenCalled();
    expect(
      screen.getByText('Invalid username or password.'),
    ).toBeInTheDocument();
  });
});
