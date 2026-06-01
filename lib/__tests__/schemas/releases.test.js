import { describe, expect, it } from 'vitest';
import {
  environmentNameSchema,
  releaseNameSchema,
} from '@/lib/schemas/releases';

describe('releaseNameSchema', () => {
  it('accepts a clean name', () => {
    expect(releaseNameSchema.safeParse('2.10.0').success).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(releaseNameSchema.safeParse('').success).toBe(false);
  });

  it('rejects a name containing "/"', () => {
    const result = releaseNameSchema.safeParse('2.10.0/rc1');
    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toBe(
      'Release name cannot contain "/"',
    );
  });
});

describe('environmentNameSchema', () => {
  it('accepts a clean environment name', () => {
    expect(environmentNameSchema.safeParse('QA').success).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(environmentNameSchema.safeParse('').success).toBe(false);
  });

  it('rejects an environment name containing "/"', () => {
    const result = environmentNameSchema.safeParse('QA/Staging');
    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toBe(
      'Environment cannot contain "/"',
    );
  });
});
