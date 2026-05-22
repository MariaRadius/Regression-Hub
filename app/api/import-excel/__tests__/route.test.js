import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';

const { db, reset } = createMockDb();
const { importExcelWorkbook } = vi.hoisted(() => ({
  importExcelWorkbook: vi.fn(),
}));

vi.mock('@/lib/server/withTeam', () => ({
  withTeam: (handler) => (req, ctx) => handler(req, ctx, {
    session: { user: { id: 'u1', teamId: 't1', role: 'admin' } },
    teamId: 't1',
    db,
  }),
  withAdmin: (handler) => (req, ctx) => handler(req, ctx, {
    session: { user: { id: 'u1', teamId: 't1', role: 'admin' } },
    teamId: 't1',
    db,
  }),
}));

vi.mock('@/lib/db/importExcelData', () => ({ importExcelWorkbook }));

import { POST } from '../route';

beforeEach(() => {
  reset();
  vi.clearAllMocks();
});

function makeRequest({ fileName = 'cases.xlsx', softwareVersion = '1.0', testEnvironment = 'QA' } = {}) {
  const mockFile = {
    arrayBuffer: async () => Buffer.from('xlsx-content').buffer,
    name: fileName,
  };
  const fields = { file: mockFile, softwareVersion, testEnvironment };
  return { formData: async () => ({ get: (k) => fields[k] ?? null }) };
}

describe('POST /api/import-excel', () => {
  it('imports workbook via db layer', async () => {
    importExcelWorkbook.mockResolvedValue({ imported: 3, updated: 1, testRunId: 'run1' });
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ imported: 3, updated: 1, testRunId: 'run1' });
    expect(importExcelWorkbook).toHaveBeenCalledWith(db, 't1', expect.objectContaining({
      softwareVersion: '1.0',
      testEnvironment: 'QA',
      buffer: expect.any(Buffer),
    }));
  });

});
