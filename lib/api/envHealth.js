import { z } from 'zod';
import { get, post } from '@/lib/http/client';

const jobSchema = z.object({
  _id: z.string(),
  status: z.enum(['queued', 'processing', 'completed', 'failed']),
  result: z.any().nullable().optional(),
  error: z.string().nullable().optional(),
  createdBy: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export function createEnvHealthJob() {
  return post('/api/reports/env-health', {});
}

export function pollEnvHealthJob(jobId) {
  return get(`/api/reports/env-health/${jobId}`, { schema: jobSchema });
}
