import { z } from 'zod';

export const createApplicationBodySchema = z.object({
  name: z.string().min(1),
  initial: z
    .string()
    .regex(
      /^[A-Z0-9]{3}$/,
      'Initial must be exactly 3 uppercase letters or digits',
    )
    .optional(),
});
