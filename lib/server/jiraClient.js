/**
 * Server-only Jira Cloud REST v3 client.
 *
 * Credentials are resolved in order: DB settings (per-team) → env vars (fallback).
 * Pass a `jiraConfig` object `{ jiraBaseUrl, jiraEmail, jiraApiToken }` from the
 * team settings to each function; any field that is null/undefined falls back to
 * the corresponding env var so existing env-var-only deployments keep working.
 *
 * @see {@link lib/server/__tests__/jiraClient.test.js}
 */

function getConfig({ jiraBaseUrl, jiraEmail, jiraApiToken } = {}) {
  const baseUrl = jiraBaseUrl ?? process.env.JIRA_BASE_URL;
  const email = jiraEmail ?? process.env.JIRA_EMAIL;
  const token = jiraApiToken ?? process.env.JIRA_API_TOKEN;
  if (!baseUrl || !email || !token) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ''), email, token };
}

export function isJiraConfigured(jiraConfig = {}) {
  return getConfig(jiraConfig) !== null;
}

/**
 * Extracts a human-readable message from a Jira error body
 * ({ errorMessages: [], errors: { field: msg } }).
 */
function jiraErrorMessage(status, body) {
  if (status === 401 || status === 403) {
    return 'Jira authentication failed — check email / API token in Admin → Jira Integration';
  }
  const messages = [
    ...(body?.errorMessages ?? []),
    ...Object.values(body?.errors ?? {}),
  ];
  if (messages.length) return `Jira: ${messages.join(' ')}`;
  return `Jira request failed (HTTP ${status})`;
}

async function jiraFetch(path, payload, jiraConfig) {
  const config = getConfig(jiraConfig);
  if (!config) {
    throw new Error(
      'Jira integration is not configured — set domain, email, and API token in Admin → Jira Integration',
    );
  }

  const auth = Buffer.from(`${config.email}:${config.token}`).toString(
    'base64',
  );
  const res = await fetch(`${config.baseUrl}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Accept-Language': 'en',
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (!res.ok) {
    throw new Error(jiraErrorMessage(res.status, body));
  }
  return body;
}

/**
 * Creates an issue. `payload` is a REST v3 create-issue body
 * (see lib/jiraIssue.js buildJiraIssuePayload).
 *
 * @param {object} payload
 * @param {{ jiraBaseUrl?: string|null, jiraEmail?: string|null, jiraApiToken?: string|null }} [jiraConfig]
 * @returns {Promise<{ key: string }>}
 */
export async function createIssue(payload, jiraConfig) {
  const body = await jiraFetch('/rest/api/3/issue', payload, jiraConfig);
  return { key: body.key };
}

/**
 * Links two issues with a "Relates" link (new issue → user story).
 *
 * @param {string} issueKey
 * @param {string} storyKey
 * @param {{ jiraBaseUrl?: string|null, jiraEmail?: string|null, jiraApiToken?: string|null }} [jiraConfig]
 */
export async function linkIssues(issueKey, storyKey, jiraConfig) {
  await jiraFetch(
    '/rest/api/3/issueLink',
    {
      type: { name: 'Relates' },
      inwardIssue: { key: issueKey },
      outwardIssue: { key: storyKey },
    },
    jiraConfig,
  );
}

function extractAdfText(node) {
  if (!node) return '';
  if (node.type === 'text') return node.text ?? '';
  if (!node.content) return '';
  const blockTypes = [
    'paragraph',
    'heading',
    'bulletList',
    'orderedList',
    'listItem',
  ];
  const sep = blockTypes.includes(node.type) ? '\n' : ' ';
  return node.content.map(extractAdfText).join(sep).trim();
}

/**
 * Fetches a Jira issue and returns its summary, description, and acceptance
 * criteria (customfield_10016) as plain text (ADF stripped).
 *
 * @param {string} storyKey - e.g. "RXR-42"
 * @param {{ jiraBaseUrl?: string|null, jiraEmail?: string|null, jiraApiToken?: string|null }} [jiraConfig]
 * @returns {Promise<{ key: string, summary: string, description: string, acceptanceCriteria: string }>}
 */
export async function getJiraStory(storyKey, jiraConfig) {
  const config = getConfig(jiraConfig);
  if (!config) {
    throw new Error(
      'Jira integration is not configured — set domain, email, and API token in Admin → Jira Integration',
    );
  }

  const auth = Buffer.from(`${config.email}:${config.token}`).toString(
    'base64',
  );
  const res = await fetch(
    `${config.baseUrl}/rest/api/3/issue/${encodeURIComponent(
      storyKey,
    )}?fields=summary,description,customfield_10016`,
    {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
        'Accept-Language': 'en',
      },
    },
  );

  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    throw new Error(jiraErrorMessage(res.status, body));
  }

  return {
    key: body.key,
    summary: body.fields.summary ?? '',
    description: extractAdfText(body.fields.description),
    acceptanceCriteria: extractAdfText(body.fields.customfield_10016),
  };
}

/**
 * Creates the failure issue and links it to its story. A link failure is
 * non-fatal — the issue already exists — so it is reported as `linkError`
 * instead of throwing.
 *
 * @param {object} payload
 * @param {string} storyKey
 * @param {{ jiraBaseUrl?: string|null, jiraEmail?: string|null, jiraApiToken?: string|null }} [jiraConfig]
 * @returns {Promise<{ key: string, linkError: string|null }>}
 */
export async function createFailureIssue(payload, storyKey, jiraConfig) {
  const { key } = await createIssue(payload, jiraConfig);
  try {
    await linkIssues(key, storyKey, jiraConfig);
    return { key, linkError: null };
  } catch (err) {
    return { key, linkError: err.message };
  }
}
