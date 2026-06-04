import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ROLES } from '@/lib/constants';
import TopNav from '../TopNav';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}));

vi.mock('next-auth/react', () => ({
  signOut: vi.fn(),
}));

vi.mock('@/components/ReleaseEnvSelector', () => ({
  default: () => null,
}));

describe('TopNav', () => {
  it('hides the releases nav item for qa users', () => {
    render(
      <TopNav
        user={{
          id: 'u1',
          name: 'QA User',
          role: ROLES.QA,
          teamId: 'radius',
          teamName: 'Radius',
        }}
      />,
    );

    expect(screen.queryByLabelText('Releases')).toBeNull();
  });

  it('shows the releases nav item for admin users', () => {
    render(
      <TopNav
        user={{
          id: 'u1',
          name: 'Admin User',
          role: ROLES.ADMIN,
          teamId: 'radius',
          teamName: 'Radius',
        }}
      />,
    );

    expect(screen.getByLabelText('Releases')).toBeInTheDocument();
  });
});
