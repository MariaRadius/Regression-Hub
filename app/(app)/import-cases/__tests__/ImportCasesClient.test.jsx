import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

// Mock the validation module so tests control gate outcomes without real xlsx parsing
vi.mock('@/utils/importValidation', () => ({
  validatePreParse: vi.fn(() => ({ ok: true, error: null })),
  validateParsedRows: vi.fn(() => ({
    valid: true,
    errors: [],
    warnings: [],
    apps: [],
  })),
}));

// Mock xlsx dynamic import used in stageFile
vi.mock('@/utils/excelImport', () => ({
  parseWorkbookBuffer: vi.fn(() => [
    {
      applicationName: 'MyApp',
      moduleName: 'Login',
      type: '',
      traceability: '',
      testKey: 'TC-001',
      testCase: 'User can log in',
      preconditions: '',
      steps: 'Enter credentials',
      expectedResult: 'Dashboard shown',
      notes: '',
      status: '',
      testedBy: '',
      testedOn: '',
    },
  ]),
}));

// Intercept dynamic `import('@/utils/excelImport')` — vitest resolves mocked module
vi.mock('@/utils/slugify', () => ({
  slugify: vi.fn((s) => (s ?? '').toLowerCase().replace(/\s+/g, '-')),
}));

function makeReleaseEnv(overrides = {}) {
  return {
    releaseId: 'r1',
    releaseName: 'v1.0',
    environments: ['QA', 'Sandbox'],
    environment: 'QA',
    activeRelease: { _id: 'r1', name: 'v1.0', archived: false, teamId: 't1' },
    ...overrides,
  };
}

const defaultRoster = [{ name: 'Alice', username: 'alice' }];
const defaultKnownApps = [{ name: 'ExistingApp', initial: 'EXA' }];

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
    render(
      <ImportCasesClient roster={defaultRoster} knownApps={defaultKnownApps} />,
    );
    expect(screen.getByText('No release selected')).toBeInTheDocument();
  });

  it('renders the dropzone and analyse control when a release is active', () => {
    useReleaseEnv.mockReturnValue(makeReleaseEnv());
    render(
      <ImportCasesClient roster={defaultRoster} knownApps={defaultKnownApps} />,
    );
    expect(screen.getByText('Import Test Cases')).toBeInTheDocument();
    expect(screen.getByTestId('upload-dropzone')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /analyse import/i }),
    ).toBeInTheDocument();
  });

  it('shows an archived warning and no dropzone interaction when archived', () => {
    useReleaseEnv.mockReturnValue(
      makeReleaseEnv({
        activeRelease: { _id: 'r1', name: 'v1.0', archived: true },
      }),
    );
    render(
      <ImportCasesClient roster={defaultRoster} knownApps={defaultKnownApps} />,
    );
    expect(screen.getByText(/is archived/i)).toBeInTheDocument();
  });

  it('shows a load error alert and disables import when roster fetch failed', () => {
    useReleaseEnv.mockReturnValue(makeReleaseEnv());
    render(<ImportCasesClient roster={null} knownApps={defaultKnownApps} />);
    expect(screen.getByText(/Failed to load team data/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /analyse import/i }),
    ).toBeDisabled();
  });

  it('shows a load error alert and disables import when knownApps fetch failed', () => {
    useReleaseEnv.mockReturnValue(makeReleaseEnv());
    render(<ImportCasesClient roster={defaultRoster} knownApps={null} />);
    expect(screen.getByText(/Failed to load team data/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /analyse import/i }),
    ).toBeDisabled();
  });

  it('surfaces Stage A validation errors and keeps import disabled', async () => {
    const { validatePreParse } = await import('@/utils/importValidation');
    validatePreParse.mockReturnValueOnce({
      ok: false,
      error: 'Environment is required',
    });

    useReleaseEnv.mockReturnValue(
      makeReleaseEnv({ environment: '', environments: ['QA'] }),
    );
    render(
      <ImportCasesClient roster={defaultRoster} knownApps={defaultKnownApps} />,
    );

    const file = new File(['dummy'], 'test.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const input = document.querySelector('input[type="file"]');
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Environment is required',
      );
    });

    expect(
      screen.getByRole('button', { name: /analyse import/i }),
    ).toBeDisabled();
  });

  it('surfaces Stage B validation errors and keeps import disabled', async () => {
    const { validatePreParse, validateParsedRows } = await import(
      '@/utils/importValidation'
    );
    validatePreParse.mockReturnValueOnce({ ok: true, error: null });
    validateParsedRows.mockReturnValueOnce({
      valid: false,
      errors: [
        'Row 1: Test Case is required',
        'Tested By "ghost" is not a team member',
      ],
      warnings: [],
      apps: [],
    });

    useReleaseEnv.mockReturnValue(makeReleaseEnv());
    render(
      <ImportCasesClient roster={defaultRoster} knownApps={defaultKnownApps} />,
    );

    const file = new File(['dummy'], 'test.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const input = document.querySelector('input[type="file"]');
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(
        screen.getByText('Row 1: Test Case is required'),
      ).toBeInTheDocument();
      expect(
        screen.getByText('Tested By "ghost" is not a team member'),
      ).toBeInTheDocument();
    });

    expect(
      screen.getByRole('button', { name: /analyse import/i }),
    ).toBeDisabled();
  });

  it('enables Analyse Import button when file passes both validation stages', async () => {
    const { validatePreParse, validateParsedRows } = await import(
      '@/utils/importValidation'
    );
    validatePreParse.mockReturnValueOnce({ ok: true, error: null });
    validateParsedRows.mockReturnValueOnce({
      valid: true,
      errors: [],
      warnings: [],
      apps: [{ name: 'MyApp', isNew: true, proposedInitial: 'MYA' }],
    });

    useReleaseEnv.mockReturnValue(makeReleaseEnv());
    render(
      <ImportCasesClient roster={defaultRoster} knownApps={defaultKnownApps} />,
    );

    const file = new File(['dummy'], 'test.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const input = document.querySelector('input[type="file"]');
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /analyse import/i }),
      ).not.toBeDisabled();
    });
  });

  it('shows client apps preview chips after a valid parse', async () => {
    const { validatePreParse, validateParsedRows } = await import(
      '@/utils/importValidation'
    );
    validatePreParse.mockReturnValueOnce({ ok: true, error: null });
    validateParsedRows.mockReturnValueOnce({
      valid: true,
      errors: [],
      warnings: [],
      apps: [
        { name: 'NewApp', isNew: true, proposedInitial: 'NAP' },
        { name: 'ExistingApp', isNew: false, proposedInitial: 'EXA' },
      ],
    });

    useReleaseEnv.mockReturnValue(makeReleaseEnv());
    render(
      <ImportCasesClient roster={defaultRoster} knownApps={defaultKnownApps} />,
    );

    const file = new File(['dummy'], 'test.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const input = document.querySelector('input[type="file"]');
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/NewApp.*new.*NAP/)).toBeInTheDocument();
      expect(screen.getByText('ExistingApp')).toBeInTheDocument();
    });
  });

  it('sends JSON rows (not FormData) when Analyse Import is clicked', async () => {
    const { importIntoRelease } = await import('@/lib/api/releases');
    importIntoRelease.mockResolvedValueOnce({
      valid: true,
      rows: [],
      createCount: 1,
      updateCount: 0,
      errors: [],
      warnings: [],
    });

    const { validatePreParse, validateParsedRows } = await import(
      '@/utils/importValidation'
    );
    validatePreParse.mockReturnValue({ ok: true, error: null });
    validateParsedRows.mockReturnValue({
      valid: true,
      errors: [],
      warnings: [],
      apps: [],
    });

    useReleaseEnv.mockReturnValue(makeReleaseEnv());
    render(
      <ImportCasesClient roster={defaultRoster} knownApps={defaultKnownApps} />,
    );

    const file = new File(['dummy'], 'test.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const input = document.querySelector('input[type="file"]');
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /analyse import/i }),
      ).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole('button', { name: /analyse import/i }));

    await waitFor(() => {
      expect(importIntoRelease).toHaveBeenCalledWith(
        'r1',
        expect.objectContaining({
          rows: expect.arrayContaining([
            expect.objectContaining({ fingerprint: expect.any(String) }),
          ]),
        }),
      );
      // Must NOT be called with FormData
      const [, bodyArg] = importIntoRelease.mock.calls[0];
      expect(bodyArg).not.toBeInstanceOf(FormData);
    });
  });
});
