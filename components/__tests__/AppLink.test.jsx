import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AppLink from '../AppLink';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('AppLink', () => {
  it('renders a next-router link with system typography styling', () => {
    render(
      <AppLink href='/test-cases?testKey=SAP-0454&status=Fail'>
        SAP-0454
      </AppLink>,
    );

    const link = screen.getByRole('link', { name: 'SAP-0454' });
    expect(link).toHaveAttribute(
      'href',
      '/test-cases?testKey=SAP-0454&status=Fail',
    );
  });
});
