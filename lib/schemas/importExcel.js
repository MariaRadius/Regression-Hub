import { z } from 'zod';

export const importExcelResponseSchema = z.object({
  imported: z.number(),
  updated: z.number(),
});
