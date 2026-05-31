import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import UploadExcel from '../UploadExcel';

const mockFetch = vi.fn();

function mockJsonResponse(data, { ok = true, status = 200 } = {}) {
  const body = JSON.stringify(data);
  return {
    ok,
    status,
    json: async () => JSON.parse(body),
    text: async () => body,
  };
}

/** Stage a file in the hidden input and click the Import button. */
function stageAndImport(file) {
  const input = document.querySelector('input[type="file"]');
  Object.defineProperty(input, 'files', { value: [file] });
  fireEvent.change(input);
  fireEvent.click(screen.getByRole('button', { name: /^import$/i }));
}

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  // Default fallback for putSettings debounced saves.
  mockFetch.mockResolvedValue(mockJsonResponse({}));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('UploadExcel', () => {
  it('renders the upload zone, environment/version inputs, and a disabled Import button', () => {
    render(<UploadExcel />);
    expect(
      screen.getByText(/Drop \.xlsx file or click to upload/i),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/QA, Staging, Production/i),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/2\.4\.1/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^import$/i })).toBeDisabled();
  });

  it('shows an error when a non-.xlsx file is dropped', () => {
    render(<UploadExcel />);
    const zone = screen.getByTestId('upload-dropzone');
    const file = new File(['content'], 'test.csv', { type: 'text/csv' });
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    expect(
      screen.getByText(/Invalid file type\. Upload a \.xlsx Excel workbook\./i),
    ).toBeInTheDocument();
  });

  it('renders initialEnv and initialVersion props in the text fields', () => {
    render(<UploadExcel initialEnv='QA' initialVersion='1.2.3' />);
    expect(screen.getByDisplayValue('QA')).toBeInTheDocument();
    expect(screen.getByDisplayValue('1.2.3')).toBeInTheDocument();
  });

  it('stages a file and enables the Import button before submitting', () => {
    render(<UploadExcel />);
    const input = document.querySelector('input[type="file"]');
    const file = new File(['fake'], 'test.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    Object.defineProperty(input, 'files', { value: [file] });
    fireEvent.change(input);
    expect(screen.getByText('test.xlsx')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^import$/i }),
    ).not.toBeDisabled();
  });

  it('shows importing status and then success after clicking Import', async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({ imported: 5, updated: 0, testRunId: 'run1' }),
    );
    render(<UploadExcel />);
    const file = new File(['fake'], 'test.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    stageAndImport(file);
    await waitFor(() => {
      expect(screen.getByText(/Imported 5 test cases/i)).toBeInTheDocument();
    });
  });

  it('calls onImported callback after a successful import', async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({ imported: 3, updated: 0, testRunId: 'run1' }),
    );
    const onImported = vi.fn();
    render(<UploadExcel onImported={onImported} />);
    const file = new File(['fake'], 'test.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    stageAndImport(file);
    await waitFor(() => expect(onImported).toHaveBeenCalledTimes(1));
  });

  it('shows an error message when the import API returns an error', async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse(
        { error: 'Sheet missing required columns' },
        { ok: false, status: 400 },
      ),
    );
    render(<UploadExcel />);
    const file = new File(['fake'], 'report.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    stageAndImport(file);
    await waitFor(() => {
      expect(
        screen.getByText(/Sheet missing required columns/i),
      ).toBeInTheDocument();
    });
  });
});
