import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/http/client', () => ({
  get: vi.fn(),
  post: vi.fn(),
}));

import { z } from 'zod';
import {
  listSnapshots,
  saveSnapshot,
  snapshotDownloadUrl,
} from '@/lib/api/snapshots';
import { get, post } from '@/lib/http/client';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('listSnapshots', () => {
  it('calls get with /api/snapshots and an object carrying a schema', async () => {
    get.mockResolvedValue([]);

    await listSnapshots();

    expect(get).toHaveBeenCalledOnce();
    const [path, opts] = get.mock.calls[0];
    expect(path).toBe('/api/snapshots');
    expect(opts).toMatchObject({ schema: expect.any(z.ZodArray) });
  });

  it('forwards extra opts to get', async () => {
    get.mockResolvedValue([]);

    await listSnapshots({ silentFailure: true });

    const [, opts] = get.mock.calls[0];
    expect(opts).toMatchObject({ silentFailure: true });
  });

  it('returns the value resolved by get', async () => {
    const fixture = [
      {
        _id: 'snap1',
        releaseId: 'rel1',
        releaseName: 'v1.0',
        environment: 'QA',
        filename: 'report.pdf',
        byteSize: 1024,
        generatedBy: 'Alice',
        generatedAt: '2026-06-01T00:00:00.000Z',
      },
    ];
    get.mockResolvedValue(fixture);

    const result = await listSnapshots();
    expect(result).toEqual(fixture);
  });
});

describe('saveSnapshot', () => {
  it('calls post with the correct release path, the exact FormData instance, and an object carrying a schema', async () => {
    const formData = new FormData();
    post.mockResolvedValue({ _id: 'snap1' });

    await saveSnapshot('rel1', formData);

    expect(post).toHaveBeenCalledOnce();
    const [path, body, opts] = post.mock.calls[0];
    expect(path).toBe('/api/releases/rel1/snapshot');
    expect(body).toBe(formData);
    expect(opts).toMatchObject({ schema: expect.any(z.ZodObject) });
  });

  it('forwards extra opts to post', async () => {
    const formData = new FormData();
    post.mockResolvedValue({ _id: 'snap1' });

    await saveSnapshot('rel2', formData, { silentFailure: true });

    const [, , opts] = post.mock.calls[0];
    expect(opts).toMatchObject({ silentFailure: true });
  });

  it('returns the value resolved by post', async () => {
    const fixture = {
      _id: 'snap2',
      releaseId: 'rel2',
      releaseName: 'v2.0',
      environment: 'Prod',
      filename: 'report-v2.pdf',
      byteSize: 2048,
      generatedBy: 'Bob',
      generatedAt: '2026-06-01T12:00:00.000Z',
    };
    const formData = new FormData();
    post.mockResolvedValue(fixture);

    const result = await saveSnapshot('rel2', formData);
    expect(result).toEqual(fixture);
  });
});

describe('snapshotDownloadUrl', () => {
  it('returns the exact download URL string for a given id', () => {
    expect(snapshotDownloadUrl('abc123')).toBe(
      '/api/snapshots/abc123/download',
    );
  });

  it('embeds different ids correctly', () => {
    expect(snapshotDownloadUrl('xyz-789')).toBe(
      '/api/snapshots/xyz-789/download',
    );
  });
});
