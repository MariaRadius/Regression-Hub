/**
 * Server-only Jira Cloud REST v3 client.
 *
 * Credentials come exclusively from env vars (JIRA_BASE_URL, JIRA_EMAIL,
 * JIRA_API_TOKEN) — never from the DB and never exposed to the client.
 * All functions throw plain Errors with operator-actionable messages; callers
 * decide whether a Jira failure is fatal (it never is for result recording).
 *
 * @see {@link lib/server/__tests__/jiraClient.test.js}
 */

function getConfig(baseUrlOverride) {
  const baseUrl = baseUrlOverride ?? process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  if (!baseUrl || !email || !token) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ''), email, token };
}

export function isJiraConfigured() {
  return getConfig() !== null;
}

/**
 * Extracts a human-readable message from a Jira error body
 * ({ errorMessages: [], errors: { field: msg } }).
 */
function jiraErrorMessage(status, body) {
  if (status === 401 || status === 403) {
    return 'Jira authentication failed — check JIRA_EMAIL / JIRA_API_TOKEN';
  }
  const messages = [
    ...(body?.errorMessages ?? []),
    ...Object.values(body?.errors ?? {}),
  ];
  if (messages.length) return `Jira: ${messages.join(' ')}`;
  return `Jira request failed (HTTP ${status})`;
}

async function jiraFetch(path, payload, baseUrlOverride) {
  const config = getConfig(baseUrlOverride);
  if (!config) {
    throw new Error(
      'Jira integration is not configured (JIRA_BASE_URL / JIRA_EMAIL / JIRA_API_TOKEN)',
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
 * @returns {Promise<{ key: string }>}
 */
export async function createIssue(payload, baseUrlOverride) {
  const body = await jiraFetch('/rest/api/3/issue', payload, baseUrlOverride);
  return { key: body.key };
}

/**
 * Links two issues with a "Relates" link (new issue → user story).
 */
export async function linkIssues(issueKey, storyKey, baseUrlOverride) {
  await jiraFetch(
    '/rest/api/3/issueLink',
    {
      type: { name: 'Relates' },
      inwardIssue: { key: issueKey },
      outwardIssue: { key: storyKey },
    },
    baseUrlOverride,
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
 * @returns {Promise<{ key: string, summary: string, description: string, acceptanceCriteria: string }>}
 */
export async function getJiraStory(storyKey, baseUrlOverride) {
  const config = getConfig(baseUrlOverride);
  if (!config) {
    throw new Error(
      'Jira integration is not configured (JIRA_BASE_URL / JIRA_EMAIL / JIRA_API_TOKEN)',
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
 * @returns {Promise<{ key: string, linkError: string|null }>}
 */
export async function createFailureIssue(payload, storyKey, baseUrlOverride) {
  const { key } = await createIssue(payload, baseUrlOverride);
  try {
    await linkIssues(key, storyKey, baseUrlOverride);
    return { key, linkError: null };
  } catch (err) {
    return { key, linkError: err.message };
  }
}
