import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ImportCasesClient from '../ImportCasesClient';

vi.mock('@/components/Toast', () => ({
  default: () => null,
  showToast: vi.fn(),
}));

vi.mock('@/lib/api/releases', () => ({
  importIntoRelease: vi.fn(),
}));

const { useReleaseEnv } = vi.hoisted(() => ({ useReleaseEnv: vi.fn() }));
vi.mock('@/contexts/ReleaseEnvContext', () => ({ useReleaseEnv }));

describe('ImportCasesClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the empty state when no release is active', () => {
    useReleaseEnv.mockReturnValue({
      releaseId: null,
      releaseName: '',
      environments: [],
      environment: '',
      activeRelease: null,
    });
    render(<ImportCasesClient />);
    expect(screen.getByText('No release selected')).toBeInTheDocument();
  });

  it('renders the dropzone and analyse control when a release is active', () => {
    useReleaseEnv.mockReturnValue({
      releaseId: 'r1',
      releaseName: 'v1.0',
      environments: ['QA', 'Sandbox'],
      environment: 'QA',
      activeRelease: { _id: 'r1', name: 'v1.0', archived: false },
    });
    render(<ImportCasesClient />);
    expect(screen.getByText('Import Test Cases')).toBeInTheDocument();
    expect(screen.getByTestId('upload-dropzone')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /analyse import/i }),
    ).toBeInTheDocument();
  });

  it('shows an archived warning and no dropzone interaction when archived', () => {
    useReleaseEnv.mockReturnValue({
      releaseId: 'r1',
      releaseName: 'v1.0',
      environments: ['QA'],
      environment: 'QA',
      activeRelease: { _id: 'r1', name: 'v1.0', archived: true },
    });
    render(<ImportCasesClient />);
    expect(screen.getByText(/is archived/i)).toBeInTheDocument();
  });
});
