import { z } from 'zod';

export const settingsResponseSchema = z
  .object({
    qaUsers: z.array(z.string()),
  })
  .passthrough();
