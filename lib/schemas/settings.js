import { z } from 'zod';

export const settingsResponseSchema = z
  .object({
    qaUsers: z.array(z.string()),
    failureThreshold: z.number().int().min(1).optional(),
    topModulesLimit: z.number().int().min(1).optional(),
  })
  .passthrough();
