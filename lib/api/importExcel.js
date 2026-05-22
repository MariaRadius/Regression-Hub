import { post } from '@/lib/http/client';
import { importExcelResponseSchema } from '@/lib/schemas/importExcel';

export function importExcel(formData, opts = {}) {
  return post('/api/import-excel', formData, {
    schema: importExcelResponseSchema,
    ...opts,
  });
}
