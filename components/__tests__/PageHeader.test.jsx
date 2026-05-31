import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PageHeader from '../PageHeader';

describe('PageHeader', () => {
  it('renders eyebrow, title and sub', () => {
    render(
      <PageHeader eyebrow='Data Grid' title='Test Cases' sub='123 rows' />,
    );
    expect(screen.getByText('Data Grid')).toBeTruthy();
    expect(screen.getByText('Test Cases')).toBeTruthy();
    expect(screen.getByText('123 rows')).toBeTruthy();
  });

  it('renders an actions slot beside the header when provided', () => {
    render(
      <PageHeader
        title='x'
        sub='y'
        actions={<button type='button'>New</button>}
      />,
    );
    expect(screen.getByRole('button', { name: 'New' })).toBeTruthy();
  });

  it('omits the eyebrow if not provided', () => {
    render(<PageHeader title='x' sub='y' />);
    expect(screen.queryByText('Data Grid')).toBeNull();
  });
});
