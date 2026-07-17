import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFailureIssue,
  createIssue,
  getIssuesByKeys,
  isJiraConfigured,
  linkIssues,
} from '@/lib/server/jiraClient';

const BASE = 'https://example.atlassian.net';

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv('JIRA_BASE_URL', BASE);
  vi.stubEnv('JIRA_EMAIL', 'qa@example.com');
  vi.stubEnv('JIRA_API_TOKEN', 'secret-token');
  vi.stubGlobal('fetch', vi.fn());
});

describe('isJiraConfigured', () => {
  it('is true when env vars provide all three values', () => {
    expect(isJiraConfigured()).toBe(true);
  });

  it('is true when DB settings provide all three values (env vars cleared)', () => {
    vi.stubEnv('JIRA_BASE_URL', '');
    vi.stubEnv('JIRA_EMAIL', '');
    vi.stubEnv('JIRA_API_TOKEN', '');
    expect(
      isJiraConfigured({
        jiraBaseUrl: 'https://example.atlassian.net',
        jiraEmail: 'qa@example.com',
        jiraApiToken: 'secret-token',
      }),
    ).toBe(true);
  });

  it('is false when any value is missing from both DB settings and env vars', () => {
    vi.stubEnv('JIRA_API_TOKEN', '');
    expect(isJiraConfigured()).toBe(false);
  });
});

describe('createIssue', () => {
  const payload = { fields: { summary: 'x' } };

  it('POSTs the payload with Basic auth and returns the created key', async () => {
    fetch.mockResolvedValue(jsonResponse(201, { key: 'RXR-5678' }));

    const result = await createIssue(payload);

    expect(result).toEqual({ key: 'RXR-5678' });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(`${BASE}/rest/api/3/issue`);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe(
      `Basic ${Buffer.from('qa@example.com:secret-token').toString('base64')}`,
    );
    expect(JSON.parse(init.body)).toEqual(payload);
  });

  it('throws a credentials hint on 401', async () => {
    fetch.mockResolvedValue(jsonResponse(401, {}));
    await expect(createIssue(payload)).rejects.toThrow(
      /check email \/ API token/,
    );
  });

  it('surfaces Jira validation messages on 400', async () => {
    fetch.mockResolvedValue(
      jsonResponse(400, {
        errorMessages: [],
        errors: { issuetype: 'The issue type selected is invalid.' },
      }),
    );
    await expect(createIssue(payload)).rejects.toThrow(
      /issue type selected is invalid/,
    );
  });

  it('throws when Jira env vars are not configured', async () => {
    vi.stubEnv('JIRA_BASE_URL', '');
    await expect(createIssue(payload)).rejects.toThrow(/not configured/);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('linkIssues', () => {
  it('creates a Relates link between the new issue and the story', async () => {
    fetch.mockResolvedValue(jsonResponse(201, {}));

    await linkIssues('RXR-5678', 'RXR-9012');

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(`${BASE}/rest/api/3/issueLink`);
    expect(JSON.parse(init.body)).toEqual({
      type: { name: 'Relates' },
      inwardIssue: { key: 'RXR-5678' },
      outwardIssue: { key: 'RXR-9012' },
    });
  });
});

describe('getIssuesByKeys', () => {
  function searchResponse(issues) {
    return {
      ok: true,
      status: 200,
      json: async () => ({ issues }),
    };
  }

  it('POSTs a JQL batch query and returns parsed issues with Date updatedAt', async () => {
    const updated = '2026-06-01T12:00:00.000+0000';
    fetch.mockResolvedValue(
      searchResponse([
        { key: 'SAP-1', fields: { summary: 'Login flow', updated } },
        { key: 'SAP-2', fields: { summary: 'Logout flow', updated } },
      ]),
    );

    const result = await getIssuesByKeys(['SAP-1', 'SAP-2']);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ key: 'SAP-1', summary: 'Login flow' });
    expect(result[0].updatedAt).toBeInstanceOf(Date);

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(`${BASE}/rest/api/3/search/jql`);
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.jql).toContain('"SAP-1"');
    expect(body.jql).toContain('"SAP-2"');
    expect(body.fields).toContain('summary');
    expect(body.fields).toContain('updated');
  });

  it('returns empty array without fetching when keys is empty', async () => {
    const result = await getIssuesByKeys([]);
    expect(result).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('throws when Jira is not configured', async () => {
    vi.stubEnv('JIRA_BASE_URL', '');
    await expect(getIssuesByKeys(['SAP-1'])).rejects.toThrow(/not configured/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('throws a credentials hint on 401', async () => {
    fetch.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    await expect(getIssuesByKeys(['SAP-1'])).rejects.toThrow(
      /check email \/ API token/,
    );
  });

  it('returns only found issues when Jira omits some keys', async () => {
    fetch.mockResolvedValue(
      searchResponse([
        {
          key: 'SAP-1',
          fields: { summary: 'Login', updated: '2026-01-01T00:00:00.000+0000' },
        },
      ]),
    );

    const result = await getIssuesByKeys(['SAP-1', 'SAP-MISSING']);
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('SAP-1');
  });

  it('handles missing fields gracefully', async () => {
    fetch.mockResolvedValue(searchResponse([{ key: 'SAP-1', fields: {} }]));

    const result = await getIssuesByKeys(['SAP-1']);
    expect(result[0]).toMatchObject({ key: 'SAP-1', summary: '' });
    expect(result[0].updatedAt).toBeInstanceOf(Date);
  });
});

describe('createFailureIssue', () => {
  const payload = { fields: { summary: 'x' } };

  it('creates and links, returning the key with no linkError', async () => {
    fetch
      .mockResolvedValueOnce(jsonResponse(201, { key: 'RXR-5678' }))
      .mockResolvedValueOnce(jsonResponse(201, {}));

    const result = await createFailureIssue(payload, 'RXR-9012');

    expect(result).toEqual({ key: 'RXR-5678', linkError: null });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('still returns the created key when linking fails', async () => {
    fetch
      .mockResolvedValueOnce(jsonResponse(201, { key: 'RXR-5678' }))
      .mockResolvedValueOnce(
        jsonResponse(404, { errorMessages: ['No issue'] }),
      );

    const result = await createFailureIssue(payload, 'RXR-9012');

    expect(result.key).toBe('RXR-5678');
    expect(result.linkError).toMatch(/No issue/);
  });
});
