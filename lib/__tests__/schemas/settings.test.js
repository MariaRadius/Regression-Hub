import { describe, expect, it } from 'vitest';
import { settingsResponseSchema } from '@/lib/schemas/settings';

describe('settings schemas', () => {
  it('settingsResponseSchema requires qaUsers array', () => {
    expect(settingsResponseSchema.safeParse({ qaUsers: ['A'] }).success).toBe(
      true,
    );
    expect(settingsResponseSchema.safeParse({}).success).toBe(false);
  });
});
