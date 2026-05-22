import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ImportCasesClient from '../ImportCasesClient';

vi.mock('@/components/UploadExcel', () => ({
  default: () => <div data-testid="upload-excel" />,
}));

vi.mock('@/components/Toast', () => ({
  default: () => null,
}));

describe('ImportCasesClient', () => {
  it('renders the "Import Test Cases" page header title', () => {
    render(<ImportCasesClient user={{ name: 'Alice' }} />);
    expect(screen.getByRole('heading', { name: 'Import Test Cases' })).toBeInTheDocument();
  });

  it('renders the UploadExcel component', () => {
    render(<ImportCasesClient user={{ name: 'Alice' }} />);
    expect(screen.getByTestId('upload-excel')).toBeInTheDocument();
  });

  it('does not crash when no user prop is passed', () => {
    expect(() => render(<ImportCasesClient />)).not.toThrow();
    expect(screen.getByRole('heading', { name: 'Import Test Cases' })).toBeInTheDocument();
  });
});
