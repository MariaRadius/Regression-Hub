# AI Test Case Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate test cases from Jira stories using AI (Claude / OpenAI / Gemini), review them in a slide-card dialog with inline editing, and batch-create approved cases into the release.

**Architecture:** A server-side `aiClient.js` abstraction routes requests to the configured AI provider via plain `fetch` (no new SDKs). The team admin configures the provider and API key in Admin Settings (stored in the `settings` MongoDB collection per team). A new API route `POST /api/releases/[id]/ai-generate-cases` fetches the Jira story, calls the AI, and returns structured drafts. A new `AITestCaseSlidesDialog` component lets QA step through each draft, edit fields, approve or skip, then batch-create approved cases via the existing test-case creation route.

**Tech Stack:** Next.js App Router, MUI v9, Vitest, fetch (no new npm packages required for AI; Jira story fetch added to existing jiraClient)

---

## File Map

### New Files
| File | Purpose |
|---|---|
| `lib/server/aiClient.js` | AI provider abstraction — Claude / OpenAI / Gemini via fetch |
| `lib/server/__tests__/aiClient.test.js` | Unit tests for aiClient |
| `app/api/releases/[id]/ai-generate-cases/route.js` | POST: fetch Jira story + call AI → return drafts |
| `app/api/releases/[id]/ai-generate-cases/__tests__/route.test.js` | Route tests |
| `components/AITestCaseSlidesDialog.jsx` | Slide-card review + approve/edit/skip UI |

### Modified Files
| File | Change |
|---|---|
| `lib/constants.js` | Add `AI_PROVIDERS` enum |
| `lib/db/settingsData.js` | Return `aiProvider`, `aiApiKey` from `getTeamSettings` |
| `lib/server/jiraClient.js` | Add `getJiraStory(storyKey)` + ADF text extractor |
| `lib/server/__tests__/jiraClient.test.js` | Tests for `getJiraStory` |
| `app/api/admin/settings/route.js` | Accept `aiProvider`, `aiApiKey` in PATCH schema |
| `app/api/admin/settings/__tests__/route.test.js` | Tests for new fields |
| `app/api/settings/route.js` | Expose `aiConfigured` + `aiProvider` in GET response |
| `app/(app)/admin/AdminClient.jsx` | Add AI provider settings section |
| `app/(app)/test-cases/page.js` | Fetch settings server-side, pass `aiConfigured` prop |
| `app/(app)/test-cases/TestCasesClient.jsx` | Add "Generate from Story" button + wire dialog |

---

## Task 1: AI Provider Constants

**Files:**
- Modify: `lib/constants.js`

- [ ] **Step 1: Add `AI_PROVIDERS` enum to constants**

Find the `JIRA_ISSUE_MODES` block in `lib/constants.js` and add after it:

```js
export const AI_PROVIDERS = Object.freeze({
  CLAUDE: 'claude',
  OPENAI: 'openai',
  GEMINI: 'gemini',
});
```

- [ ] **Step 2: Commit**

```bash
git add lib/constants.js
git commit -m "RXR-11849: Add AI_PROVIDERS constant"
```

---

## Task 2: Settings DB Layer — aiProvider + aiApiKey

**Files:**
- Modify: `lib/db/settingsData.js`

- [ ] **Step 1: Write failing test**

In `lib/db/__tests__/settingsData.test.js` (or add to existing test if present), add:

```js
it('returns aiProvider and aiApiKey from the settings document', async () => {
  db.collection('settings').findOne.mockResolvedValue({
    teamId: 't1',
    aiProvider: 'claude',
    aiApiKey: 'sk-test',
  });
  db.collection('users').find.mockReturnValue({ sort: () => ({ toArray: async () => [] }) });

  const result = await getTeamSettings(db, 't1');
  expect(result.aiProvider).toBe('claude');
  expect(result.aiApiKey).toBe('sk-test');
});

it('returns null for aiProvider and aiApiKey when not configured', async () => {
  db.collection('settings').findOne.mockResolvedValue(null);
  db.collection('users').find.mockReturnValue({ sort: () => ({ toArray: async () => [] }) });

  const result = await getTeamSettings(db, 't1');
  expect(result.aiProvider).toBeNull();
  expect(result.aiApiKey).toBeNull();
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run lib/db/__tests__/settingsData.test.js
```

- [ ] **Step 3: Extend `getTeamSettings` return value**

In `lib/db/settingsData.js`, add to the return object:

```js
return {
  qaUsers: users.map((u) => u.name),
  failureThreshold: settingsDoc?.failureThreshold ?? DASHBOARD_TOP_FAILING_MODULES_FAILURE_THRESHOLD,
  topModulesLimit: settingsDoc?.topModulesLimit ?? DASHBOARD_TOP_FAILING_MODULES_LIMIT,
  jiraIssueMode: settingsDoc?.jiraIssueMode ?? JIRA_ISSUE_MODE_DEFAULT,
  aiProvider: settingsDoc?.aiProvider ?? null,
  aiApiKey: settingsDoc?.aiApiKey ?? null,
};
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npx vitest run lib/db/__tests__/settingsData.test.js
```

- [ ] **Step 5: Commit**

```bash
git add lib/db/settingsData.js lib/db/__tests__/settingsData.test.js
git commit -m "RXR-11849: Add aiProvider/aiApiKey to team settings"
```

---

## Task 3: Admin Settings API — Accept AI Fields

**Files:**
- Modify: `app/api/admin/settings/route.js`
- Modify: `app/api/admin/settings/__tests__/route.test.js`

- [ ] **Step 1: Add AI fields to test**

In `app/api/admin/settings/__tests__/route.test.js`, add:

```js
it('accepts aiProvider and aiApiKey and passes them to updateTeamSettings', async () => {
  getTeamSettings.mockResolvedValue({ failureThreshold: 5, topModulesLimit: 5, jiraIssueMode: 'ask', aiProvider: null, aiApiKey: null });
  updateTeamSettings.mockResolvedValue();
  appendAdminActivity.mockResolvedValue();

  const req = new Request('http://localhost/api/admin/settings', {
    method: 'PATCH',
    body: JSON.stringify({ aiProvider: 'claude', aiApiKey: 'sk-abc' }),
  });
  const res = await PATCH(req, {});
  expect(res.status).toBe(200);
  expect(updateTeamSettings).toHaveBeenCalledWith(
    db, 't1',
    expect.objectContaining({ aiProvider: 'claude', aiApiKey: 'sk-abc' }),
  );
});

it('rejects unknown aiProvider values', async () => {
  const req = new Request('http://localhost/api/admin/settings', {
    method: 'PATCH',
    body: JSON.stringify({ aiProvider: 'llama' }),
  });
  const res = await PATCH(req, {});
  expect(res.status).toBe(400);
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run "app/api/admin/settings/__tests__/route.test.js"
```

- [ ] **Step 3: Extend the route**

In `app/api/admin/settings/route.js`:

Add `AI_PROVIDERS` to imports:
```js
import { AUDIT_ACTION, AUDIT_CATEGORY, AI_PROVIDERS, JIRA_ISSUE_MODES } from '@/lib/constants';
```

Extend `patchBodySchema`:
```js
const patchBodySchema = z.object({
  failureThreshold: z.number().int().min(1).max(50).optional(),
  topModulesLimit: z.number().int().min(1).max(10).optional(),
  jiraIssueMode: z.enum(Object.values(JIRA_ISSUE_MODES)).optional(),
  aiProvider: z.enum(Object.values(AI_PROVIDERS)).nullable().optional(),
  aiApiKey: z.string().trim().optional(),
});
```

Extend `SETTING_LABELS`:
```js
const SETTING_LABELS = {
  failureThreshold: 'Failure threshold',
  topModulesLimit: 'Top modules limit',
  jiraIssueMode: 'Jira issue creation',
  aiProvider: 'AI provider',
  aiApiKey: 'AI API key',
};
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npx vitest run "app/api/admin/settings/__tests__/route.test.js"
```

- [ ] **Step 5: Expose aiConfigured in `app/api/settings/route.js`**

```js
import { AI_PROVIDERS } from '@/lib/constants';

export const GET = withTeam(async (_req, _ctx, { teamId, db }) => {
  const settings = await getTeamSettings(db, teamId);
  return NextResponse.json({
    ...settings,
    aiApiKey: undefined,                          // never expose key to client
    aiConfigured: Boolean(settings.aiProvider && settings.aiApiKey),
    jiraConfigured: isJiraConfigured(),
    jiraBaseUrl: process.env.JIRA_BASE_URL || null,
  });
});
```

- [ ] **Step 6: Commit**

```bash
git add app/api/admin/settings/route.js app/api/admin/settings/__tests__/route.test.js app/api/settings/route.js
git commit -m "RXR-11849: Extend admin settings API with AI provider fields"
```

---

## Task 4: Jira Story Fetch

**Files:**
- Modify: `lib/server/jiraClient.js`
- Modify: `lib/server/__tests__/jiraClient.test.js`

- [ ] **Step 1: Write failing test**

In `lib/server/__tests__/jiraClient.test.js`, add:

```js
describe('getJiraStory', () => {
  it('returns story fields as plain text', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        key: 'RXR-42',
        fields: {
          summary: 'User can reset password',
          description: {
            type: 'doc', version: 1,
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'As a user I want to reset my password.' }] }],
          },
          customfield_10016: null,
        },
      }),
    });

    const story = await getJiraStory('RXR-42');
    expect(story.key).toBe('RXR-42');
    expect(story.summary).toBe('User can reset password');
    expect(story.description).toContain('reset my password');
    expect(story.acceptanceCriteria).toBe('');
  });

  it('throws when Jira returns 404', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ errorMessages: ['Issue not found'] }),
    });
    await expect(getJiraStory('RXR-99')).rejects.toThrow('Jira: Issue not found');
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run "lib/server/__tests__/jiraClient.test.js"
```

- [ ] **Step 3: Add `extractAdfText` + `getJiraStory` to `lib/server/jiraClient.js`**

Add before the exports at the bottom of the file:

```js
function extractAdfText(node) {
  if (!node) return '';
  if (node.type === 'text') return node.text ?? '';
  if (!node.content) return '';
  const blockTypes = ['paragraph', 'heading', 'bulletList', 'orderedList', 'listItem'];
  const sep = blockTypes.includes(node.type) ? '\n' : ' ';
  return node.content.map(extractAdfText).join(sep).trim();
}

export async function getJiraStory(storyKey) {
  const config = getConfig();
  if (!config) throw new Error('Jira integration is not configured');

  const auth = Buffer.from(`${config.email}:${config.token}`).toString('base64');
  const res = await fetch(
    `${config.baseUrl}/rest/api/3/issue/${encodeURIComponent(storyKey)}?fields=summary,description,customfield_10016`,
    { headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' } },
  );

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(jiraErrorMessage(res.status, body));
  }

  const data = await res.json();
  return {
    key: data.key,
    summary: data.fields.summary ?? '',
    description: extractAdfText(data.fields.description),
    acceptanceCriteria: extractAdfText(data.fields.customfield_10016),
  };
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npx vitest run "lib/server/__tests__/jiraClient.test.js"
```

- [ ] **Step 5: Commit**

```bash
git add lib/server/jiraClient.js lib/server/__tests__/jiraClient.test.js
git commit -m "RXR-11849: Add getJiraStory to jiraClient"
```

---

## Task 5: AI Client — Multi-Provider Abstraction

**Files:**
- Create: `lib/server/aiClient.js`
- Create: `lib/server/__tests__/aiClient.test.js`

- [ ] **Step 1: Write failing tests**

Create `lib/server/__tests__/aiClient.test.js`:

```js
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_PROVIDERS } from '@/lib/constants';
import { generateTestCasesFromStory, isAiConfigured } from '@/lib/server/aiClient';

const story = {
  key: 'RXR-42',
  summary: 'User can reset password',
  description: 'As a user I want to reset my password via email link.',
  acceptanceCriteria: 'Given valid email, When I click reset, Then I receive an email.',
};

const mockDrafts = [
  {
    testCase: 'Happy path reset',
    preconditions: 'User has a registered email',
    steps: '<ol><li>Go to login page</li><li>Click Forgot Password</li></ol>',
    expectedResult: 'Reset email sent',
    priority: 'High',
    type: 'Functional Test',
  },
];

const okResponse = (body) => ({
  ok: true,
  json: async () => body,
});

describe('isAiConfigured', () => {
  it('returns true when provider and key are set', () => {
    expect(isAiConfigured({ aiProvider: 'claude', aiApiKey: 'sk-x' })).toBe(true);
  });
  it('returns false when either is missing', () => {
    expect(isAiConfigured({ aiProvider: null, aiApiKey: 'sk-x' })).toBe(false);
    expect(isAiConfigured({ aiProvider: 'claude', aiApiKey: '' })).toBe(false);
  });
});

describe('generateTestCasesFromStory — Claude', () => {
  it('calls Anthropic API and returns parsed test cases', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      okResponse({ content: [{ text: JSON.stringify({ testCases: mockDrafts }) }] }),
    );

    const result = await generateTestCasesFromStory(
      { aiProvider: AI_PROVIDERS.CLAUDE, aiApiKey: 'sk-claude' },
      story,
    );

    expect(fetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result).toEqual(mockDrafts);
  });
});

describe('generateTestCasesFromStory — OpenAI', () => {
  it('calls OpenAI API and returns parsed test cases', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      okResponse({ choices: [{ message: { content: JSON.stringify({ testCases: mockDrafts }) } }] }),
    );

    const result = await generateTestCasesFromStory(
      { aiProvider: AI_PROVIDERS.OPENAI, aiApiKey: 'sk-openai' },
      story,
    );

    expect(fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result).toEqual(mockDrafts);
  });
});

describe('generateTestCasesFromStory — Gemini', () => {
  it('calls Gemini API and returns parsed test cases', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      okResponse({
        candidates: [{ content: { parts: [{ text: JSON.stringify({ testCases: mockDrafts }) }] } }],
      }),
    );

    const result = await generateTestCasesFromStory(
      { aiProvider: AI_PROVIDERS.GEMINI, aiApiKey: 'AIza-test' },
      story,
    );

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('generativelanguage.googleapis.com'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result).toEqual(mockDrafts);
  });
});

describe('generateTestCasesFromStory — error paths', () => {
  it('throws when provider is not configured', async () => {
    await expect(
      generateTestCasesFromStory({ aiProvider: null, aiApiKey: null }, story),
    ).rejects.toThrow('AI provider not configured');
  });

  it('throws when API returns non-ok status', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    await expect(
      generateTestCasesFromStory({ aiProvider: AI_PROVIDERS.CLAUDE, aiApiKey: 'bad' }, story),
    ).rejects.toThrow('Claude API error: 401');
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run "lib/server/__tests__/aiClient.test.js"
```

- [ ] **Step 3: Create `lib/server/aiClient.js`**

```js
import { AI_PROVIDERS } from '@/lib/constants';

const SYSTEM = 'You are a senior QA engineer. Return only valid JSON — no markdown fences, no explanation.';

function buildPrompt(story) {
  return `Generate test cases for the following Jira user story.

Story: ${story.key} — ${story.summary}
${story.description ? `\nDescription:\n${story.description}` : ''}
${story.acceptanceCriteria ? `\nAcceptance Criteria:\n${story.acceptanceCriteria}` : ''}

Return a JSON object with a "testCases" array. Each item must have exactly these keys:
- "testCase": string — short, descriptive title
- "preconditions": string — setup requirements (plain text)
- "steps": string — steps as HTML: <ol><li>Step text</li></ol>
- "expectedResult": string — expected outcome (plain text)
- "priority": "High" | "Medium" | "Low"
- "type": "Functional Test" | "Edge Case" | "Negative Test" | "Security Test"

Generate 5–8 diverse test cases covering happy path, edge cases, and negative scenarios.`;
}

function parseResponse(text) {
  const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/\s*```$/, '');
  const json = JSON.parse(cleaned);
  if (!Array.isArray(json.testCases)) throw new Error('AI returned unexpected format — missing testCases array');
  return json.testCases;
}

async function callClaude(apiKey, story) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-8',
      max_tokens: 4096,
      system: SYSTEM,
      messages: [{ role: 'user', content: buildPrompt(story) }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API error: ${res.status}`);
  const data = await res.json();
  return parseResponse(data.content[0].text);
}

async function callOpenAI(apiKey, story) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: buildPrompt(story) },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI API error: ${res.status}`);
  const data = await res.json();
  return parseResponse(data.choices[0].message.content);
}

async function callGemini(apiKey, story) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(story) }] }],
        generationConfig: { response_mime_type: 'application/json' },
        systemInstruction: { parts: [{ text: SYSTEM }] },
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
  const data = await res.json();
  return parseResponse(data.candidates[0].content.parts[0].text);
}

export function isAiConfigured({ aiProvider, aiApiKey }) {
  return Boolean(aiProvider && aiApiKey);
}

export async function generateTestCasesFromStory({ aiProvider, aiApiKey }, story) {
  if (!aiProvider || !aiApiKey) throw new Error('AI provider not configured');
  switch (aiProvider) {
    case AI_PROVIDERS.CLAUDE:  return callClaude(apiKey, story);
    case AI_PROVIDERS.OPENAI: return callOpenAI(apiKey, story);
    case AI_PROVIDERS.GEMINI:  return callGemini(apiKey, story);
    default: throw new Error(`Unknown AI provider: ${aiProvider}`);
  }
}
```

> **Note:** The switch cases use `apiKey` — fix to use `aiApiKey` parameter:

```js
export async function generateTestCasesFromStory({ aiProvider, aiApiKey }, story) {
  if (!aiProvider || !aiApiKey) throw new Error('AI provider not configured');
  switch (aiProvider) {
    case AI_PROVIDERS.CLAUDE:  return callClaude(aiApiKey, story);
    case AI_PROVIDERS.OPENAI: return callOpenAI(aiApiKey, story);
    case AI_PROVIDERS.GEMINI:  return callGemini(aiApiKey, story);
    default: throw new Error(`Unknown AI provider: ${aiProvider}`);
  }
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npx vitest run "lib/server/__tests__/aiClient.test.js"
```

- [ ] **Step 5: Commit**

```bash
git add lib/server/aiClient.js lib/server/__tests__/aiClient.test.js
git commit -m "RXR-11849: Add multi-provider AI client (Claude/OpenAI/Gemini)"
```

---

## Task 6: Generate Test Cases API Route

**Files:**
- Create: `app/api/releases/[id]/ai-generate-cases/route.js`
- Create: `app/api/releases/[id]/ai-generate-cases/__tests__/route.test.js`

- [ ] **Step 1: Write failing tests**

Create `app/api/releases/[id]/ai-generate-cases/__tests__/route.test.js`:

```js
import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';
import { ApiError } from '@/lib/errors';

const { db, reset } = createMockDb();

const { getTeamSettings, getRelease, getJiraStory, generateTestCasesFromStory, isAiConfigured } =
  vi.hoisted(() => ({
    getTeamSettings: vi.fn(),
    getRelease: vi.fn(),
    getJiraStory: vi.fn(),
    generateTestCasesFromStory: vi.fn(),
    isAiConfigured: vi.fn(),
  }));

vi.mock('@/lib/server/withTeam', () => ({
  withTeam: (handler) => async (req, ctx) => {
    try {
      return await handler(req, ctx, { teamId: 't1', db, session: { user: { id: 'u1' } } });
    } catch (err) {
      if (err instanceof ApiError)
        return NextResponse.json({ error: err.message }, { status: err.status });
      throw err;
    }
  },
}));
vi.mock('@/lib/db/settingsData', () => ({ getTeamSettings }));
vi.mock('@/lib/db/releasesData', () => ({ getRelease }));
vi.mock('@/lib/server/jiraClient', () => ({ getJiraStory }));
vi.mock('@/lib/server/aiClient', () => ({ generateTestCasesFromStory, isAiConfigured }));

import { POST } from '../route';

const mockDraft = {
  testCase: 'Login test',
  preconditions: 'User exists',
  steps: '<ol><li>Open app</li></ol>',
  expectedResult: 'Login succeeds',
  priority: 'High',
  type: 'Functional Test',
};

beforeEach(() => {
  reset();
  getTeamSettings.mockResolvedValue({ aiProvider: 'claude', aiApiKey: 'sk-test' });
  isAiConfigured.mockReturnValue(true);
  getRelease.mockResolvedValue({ _id: 'rel1', name: 'v2.9' });
  getJiraStory.mockResolvedValue({ key: 'RXR-42', summary: 'Login', description: '', acceptanceCriteria: '' });
  generateTestCasesFromStory.mockResolvedValue([mockDraft]);
});

describe('POST /api/releases/[id]/ai-generate-cases', () => {
  it('returns generated test cases with story info', async () => {
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ jiraStory: 'RXR-42' }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: 'rel1' }) });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.testCases).toHaveLength(1);
    expect(body.story.key).toBe('RXR-42');
  });

  it('returns 400 when jiraStory is missing', async () => {
    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({}) });
    const res = await POST(req, { params: Promise.resolve({ id: 'rel1' }) });
    expect(res.status).toBe(400);
  });

  it('returns 400 when AI is not configured', async () => {
    isAiConfigured.mockReturnValue(false);
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ jiraStory: 'RXR-42' }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: 'rel1' }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('AI provider not configured');
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run "app/api/releases/\[id\]/ai-generate-cases/__tests__/route.test.js"
```

- [ ] **Step 3: Create `app/api/releases/[id]/ai-generate-cases/route.js`**

```js
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getRelease } from '@/lib/db/releasesData';
import { getTeamSettings } from '@/lib/db/settingsData';
import { ApiError } from '@/lib/errors';
import { generateTestCasesFromStory, isAiConfigured } from '@/lib/server/aiClient';
import { getJiraStory } from '@/lib/server/jiraClient';
import { JIRA_KEY_RE } from '@/lib/schemas/testCases';
import { withTeam } from '@/lib/server/withTeam';

const bodySchema = z.object({
  jiraStory: z.string().regex(JIRA_KEY_RE, 'Invalid Jira story key (expected format: ABC-123)'),
});

export const POST = withTeam(async (request, { params }, { teamId, db }) => {
  const { id: releaseId } = await params;
  const body = await request.json();

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) throw new ApiError(400, parsed.error.issues[0].message);

  const settings = await getTeamSettings(db, teamId);
  if (!isAiConfigured(settings)) {
    throw new ApiError(400, 'AI provider not configured — set it in Admin → Settings');
  }

  await getRelease(db, teamId, releaseId);

  const story = await getJiraStory(parsed.data.jiraStory);
  const testCases = await generateTestCasesFromStory(settings, story);

  return NextResponse.json({ testCases, story });
});
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npx vitest run "app/api/releases/\[id\]/ai-generate-cases/__tests__/route.test.js"
```

- [ ] **Step 5: Commit**

```bash
git add app/api/releases/\[id\]/ai-generate-cases/
git commit -m "RXR-11849: Add AI generate test cases route"
```

---

## Task 7: Admin UI — AI Provider Settings Section

**Files:**
- Modify: `app/(app)/admin/AdminClient.jsx`

- [ ] **Step 1: Add `AI_PROVIDERS` import and state fields**

In `AdminClient.jsx`, add `AI_PROVIDERS` to the constants import:

```js
import { AI_PROVIDERS, JIRA_ISSUE_MODE_DEFAULT, JIRA_ISSUE_MODES, ROLES } from '@/lib/constants';
```

In the `dashboardSettings` state initialisation (find where `jiraIssueMode` is defaulted), also add:

```js
const [dashboardSettings, setDashboardSettings] = useState({
  failureThreshold: settings?.failureThreshold ?? 10,
  topModulesLimit: settings?.topModulesLimit ?? 5,
  jiraIssueMode: settings?.jiraIssueMode ?? JIRA_ISSUE_MODE_DEFAULT,
  aiProvider: settings?.aiProvider ?? null,
  aiApiKey: settings?.aiApiKey ?? '',
});
```

- [ ] **Step 2: Wire `aiProvider` + `aiApiKey` through `saveSettings`**

The existing `saveSettings` function calls `updateAdminSettings(dashboardSettings)`. Since `dashboardSettings` now includes `aiProvider` and `aiApiKey`, no change is needed there — the patch flows through automatically.

- [ ] **Step 3: Add the AI settings UI block**

Find the closing section of the settings form (just before the Save button or after the Jira issue mode select) and insert:

```jsx
{/* AI Test Case Generation */}
<Stack spacing={2}>
  <Typography variant='sectionTitle' sx={{ fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary' }}>
    AI Test Case Generation
  </Typography>

  <TextField
    select
    label='AI Provider'
    size='small'
    fullWidth
    value={dashboardSettings.aiProvider ?? ''}
    onChange={(e) =>
      setDashboardSettings((s) => ({ ...s, aiProvider: e.target.value || null, aiApiKey: '' }))
    }
    disabled={settingsSaving}
    slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
    helperText='Select a provider to enable AI-powered test case generation from Jira stories.'
  >
    <MenuItem value=''>Disabled</MenuItem>
    <MenuItem value={AI_PROVIDERS.CLAUDE}>Claude (Anthropic)</MenuItem>
    <MenuItem value={AI_PROVIDERS.OPENAI}>OpenAI (GPT-4o)</MenuItem>
    <MenuItem value={AI_PROVIDERS.GEMINI}>Google Gemini</MenuItem>
  </TextField>

  {dashboardSettings.aiProvider && (
    <TextField
      label='API Key'
      size='small'
      fullWidth
      type='password'
      value={dashboardSettings.aiApiKey ?? ''}
      onChange={(e) => setDashboardSettings((s) => ({ ...s, aiApiKey: e.target.value }))}
      disabled={settingsSaving}
      placeholder='Paste your API key here'
      helperText={
        dashboardSettings.aiProvider === AI_PROVIDERS.CLAUDE
          ? 'Get your key at console.anthropic.com → API Keys'
          : dashboardSettings.aiProvider === AI_PROVIDERS.OPENAI
            ? 'Get your key at platform.openai.com → API Keys'
            : 'Get your key at aistudio.google.com → Get API key'
      }
    />
  )}
</Stack>
```

- [ ] **Step 4: Verify the admin settings page still loads (manual)**

Start dev server (`npm run dev`) and navigate to `/admin`. Confirm the AI section renders, provider dropdown works, API key field appears when a provider is selected, and Save works without errors.

- [ ] **Step 5: Commit**

```bash
git add app/\(app\)/admin/AdminClient.jsx
git commit -m "RXR-11849: Add AI provider settings to admin UI"
```

---

## Task 8: AITestCaseSlidesDialog Component

**Files:**
- Create: `components/AITestCaseSlidesDialog.jsx`

- [ ] **Step 1: Create the component**

Create `components/AITestCaseSlidesDialog.jsx`:

```jsx
'use client';

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloseIcon from '@mui/icons-material/Close';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import {
  Alert,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useCallback, useEffect, useState } from 'react';
import { createTestCaseForRelease, listTestCasesForRelease } from '@/lib/api/releases';

const PRIORITIES = ['High', 'Medium', 'Low'];
const TYPES = ['Functional Test', 'Edge Case', 'Negative Test', 'Security Test'];

function SetupPhase({ jiraStory, setJiraStory, applicationId, setApplicationId, moduleId, setModuleId, applications, modules, generating, error, onGenerate, onClose }) {
  return (
    <>
      <DialogContent>
        <Stack spacing={3}>
          {error && <Alert severity='error'>{error}</Alert>}
          <Alert severity='info' icon={<AutoAwesomeIcon />}>
            Enter a Jira story key. The AI will read the story and generate test cases for your review.
          </Alert>
          <TextField
            label='Jira Story Key'
            value={jiraStory}
            onChange={(e) => setJiraStory(e.target.value.toUpperCase())}
            placeholder='e.g. RXR-123'
            size='small'
            fullWidth
            disabled={generating}
            autoFocus
          />
          <TextField
            select
            label='Application'
            value={applicationId}
            onChange={(e) => setApplicationId(e.target.value)}
            size='small'
            fullWidth
            required
            disabled={generating}
            slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
          >
            <MenuItem value=''>Select application</MenuItem>
            {applications.map((a) => (
              <MenuItem key={a._id} value={a._id}>{a.applicationName}</MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label='Module'
            value={moduleId}
            onChange={(e) => setModuleId(e.target.value)}
            size='small'
            fullWidth
            required
            disabled={generating || !applicationId}
            slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
          >
            <MenuItem value=''>Select module</MenuItem>
            {modules
              .filter((m) => !applicationId || m.applicationId === applicationId)
              .map((m) => (
                <MenuItem key={m._id} value={m._id}>{m.moduleName}</MenuItem>
              ))}
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant='outlined' onClick={onClose} disabled={generating}>Cancel</Button>
        <Button
          variant='contained'
          startIcon={generating ? <CircularProgress size={16} color='inherit' /> : <AutoAwesomeIcon />}
          onClick={onGenerate}
          disabled={generating || !jiraStory.trim() || !applicationId || !moduleId}
        >
          {generating ? 'Generating…' : 'Generate test cases'}
        </Button>
      </DialogActions>
    </>
  );
}

function SlidePhase({ slides, currentIndex, setCurrentIndex, decisions, setDecisions, edits, setEdits, storyKey, creating, onCreateApproved, onClose }) {
  const total = slides.length;
  const slide = { ...slides[currentIndex], ...(edits[currentIndex] ?? {}) };
  const decision = decisions[currentIndex];
  const approvedCount = Object.values(decisions).filter((d) => d === 'approved').length;

  const updateEdit = useCallback((field, value) => {
    setEdits((prev) => ({ ...prev, [currentIndex]: { ...(prev[currentIndex] ?? {}), [field]: value } }));
  }, [currentIndex, setEdits]);

  const setDecision = (val) => {
    setDecisions((prev) => ({ ...prev, [currentIndex]: val }));
  };

  const goNext = () => { if (currentIndex < total - 1) setCurrentIndex((i) => i + 1); };
  const goPrev = () => { if (currentIndex > 0) setCurrentIndex((i) => i - 1); };

  return (
    <>
      <DialogContent sx={{ pt: 1 }}>
        <Stack spacing={2}>
          {/* Progress bar */}
          <Stack spacing={0.5}>
            <Stack direction='row' sx={{ justifyContent: 'space-between' }}>
              <Typography variant='caption' sx={{ color: 'text.secondary' }}>
                {storyKey} — Test case {currentIndex + 1} of {total}
              </Typography>
              <Typography variant='caption' sx={{ color: 'text.secondary' }}>
                {approvedCount} approved
              </Typography>
            </Stack>
            <LinearProgress variant='determinate' value={((currentIndex + 1) / total) * 100} />
          </Stack>

          {/* Decision chips */}
          <Stack direction='row' spacing={1}>
            <Chip
              icon={<CheckCircleIcon />}
              label='Approved'
              color={decision === 'approved' ? 'success' : 'default'}
              variant={decision === 'approved' ? 'filled' : 'outlined'}
              onClick={() => setDecision('approved')}
              clickable
              size='small'
            />
            <Chip
              icon={<RemoveCircleOutlineIcon />}
              label='Skip'
              color={decision === 'skipped' ? 'warning' : 'default'}
              variant={decision === 'skipped' ? 'filled' : 'outlined'}
              onClick={() => setDecision('skipped')}
              clickable
              size='small'
            />
          </Stack>

          {/* Editable fields */}
          <TextField label='Test Case Title' value={slide.testCase ?? ''} onChange={(e) => updateEdit('testCase', e.target.value)} size='small' fullWidth />
          <Stack direction='row' spacing={1}>
            <TextField select label='Priority' value={slide.priority ?? 'Medium'} onChange={(e) => updateEdit('priority', e.target.value)} size='small' sx={{ flex: 1 }}>
              {PRIORITIES.map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}
            </TextField>
            <TextField select label='Type' value={slide.type ?? 'Functional Test'} onChange={(e) => updateEdit('type', e.target.value)} size='small' sx={{ flex: 2 }}>
              {TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
            </TextField>
          </Stack>
          <TextField label='Preconditions' value={slide.preconditions ?? ''} onChange={(e) => updateEdit('preconditions', e.target.value)} size='small' fullWidth multiline minRows={2} />
          <TextField
            label='Steps (plain text — one step per line)'
            value={(slide.steps ?? '').replace(/<li>/g, '').replace(/<\/li>/g, '\n').replace(/<\/?ol>/g, '').trim()}
            onChange={(e) => {
              const html = '<ol>' + e.target.value.split('\n').filter(Boolean).map((s) => `<li>${s}</li>`).join('') + '</ol>';
              updateEdit('steps', html);
            }}
            size='small'
            fullWidth
            multiline
            minRows={3}
            helperText='Each line becomes a numbered step.'
          />
          <TextField label='Expected Result' value={slide.expectedResult ?? ''} onChange={(e) => updateEdit('expectedResult', e.target.value)} size='small' fullWidth multiline minRows={2} />
        </Stack>
      </DialogContent>

      <DialogActions>
        <IconButton onClick={goPrev} disabled={currentIndex === 0}><ArrowBackIcon /></IconButton>
        <IconButton onClick={goNext} disabled={currentIndex === total - 1}><ArrowForwardIcon /></IconButton>
        <Button variant='outlined' onClick={onClose} disabled={creating} sx={{ ml: 'auto' }}>Cancel</Button>
        <Button
          variant='contained'
          disabled={approvedCount === 0 || creating}
          onClick={onCreateApproved}
          startIcon={creating ? <CircularProgress size={16} color='inherit' /> : undefined}
        >
          {creating ? 'Creating…' : `Create ${approvedCount} approved`}
        </Button>
      </DialogActions>
    </>
  );
}

export default function AITestCaseSlidesDialog({ open, onClose, onSuccess, releaseId }) {
  const [phase, setPhase] = useState('setup');
  const [jiraStory, setJiraStory] = useState('');
  const [applicationId, setApplicationId] = useState('');
  const [moduleId, setModuleId] = useState('');
  const [applications, setApplications] = useState([]);
  const [modules, setModules] = useState([]);
  const [error, setError] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [slides, setSlides] = useState([]);
  const [storyKey, setStoryKey] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [decisions, setDecisions] = useState({});
  const [edits, setEdits] = useState({});
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPhase('setup');
    setJiraStory('');
    setApplicationId('');
    setModuleId('');
    setError(null);
    setSlides([]);
    setDecisions({});
    setEdits({});
    setCurrentIndex(0);
  }, [open]);

  // Load applications + modules from existing test cases meta
  useEffect(() => {
    if (!open || !releaseId) return;
    listTestCasesForRelease(releaseId, { includeMeta: true, limit: 1 })
      .then((data) => {
        setApplications(data.meta?.applications ?? []);
        setModules(data.meta?.modules ?? []);
      })
      .catch(() => {});
  }, [open, releaseId]);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/releases/${releaseId}/ai-generate-cases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jiraStory: jiraStory.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Generation failed');
      setSlides(data.testCases);
      setStoryKey(data.story.key);
      setPhase('slides');
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }, [releaseId, jiraStory]);

  const handleCreateApproved = useCallback(async () => {
    setCreating(true);
    setError(null);
    try {
      const approved = slides
        .map((slide, i) => ({ ...slide, ...(edits[i] ?? {}), _decision: decisions[i] }))
        .filter((s) => s._decision === 'approved');

      for (const draft of approved) {
        await createTestCaseForRelease(releaseId, {
          applicationId,
          moduleId,
          testCase: draft.testCase,
          preconditions: draft.preconditions,
          steps: draft.steps,
          expectedResult: draft.expectedResult,
          priority: draft.priority,
          type: draft.type,
          jiraStory: jiraStory.trim(),
        });
      }
      onSuccess(approved.length);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }, [slides, edits, decisions, applicationId, moduleId, releaseId, jiraStory, onSuccess]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth='md' fullWidth>
      <DialogTitle>
        <Stack direction='row' sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
            <AutoAwesomeIcon fontSize='small' color='primary' />
            <Typography variant='panelTitle'>
              {phase === 'setup' ? 'Generate from Jira Story' : `Review Generated Test Cases`}
            </Typography>
          </Stack>
          <IconButton size='small' onClick={onClose} aria-label='Close'><CloseIcon fontSize='small' /></IconButton>
        </Stack>
      </DialogTitle>

      {phase === 'setup' && (
        <SetupPhase
          jiraStory={jiraStory} setJiraStory={setJiraStory}
          applicationId={applicationId} setApplicationId={setApplicationId}
          moduleId={moduleId} setModuleId={setModuleId}
          applications={applications} modules={modules}
          generating={generating} error={error}
          onGenerate={handleGenerate} onClose={onClose}
        />
      )}

      {phase === 'slides' && (
        <SlidePhase
          slides={slides} currentIndex={currentIndex} setCurrentIndex={setCurrentIndex}
          decisions={decisions} setDecisions={setDecisions}
          edits={edits} setEdits={setEdits}
          storyKey={storyKey} creating={creating}
          onCreateApproved={handleCreateApproved} onClose={onClose}
        />
      )}
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify MUI icon names exist**

```bash
node -e "const i = require('@mui/icons-material'); ['AutoAwesome','CheckCircle','RemoveCircleOutline','ArrowBack','ArrowForward'].forEach(n => console.log(n, !!i[n]))"
```

Expected: all `true`. If any is `false`, find the correct name via `ls node_modules/@mui/icons-material | grep -i <name>`.

- [ ] **Step 3: Commit**

```bash
git add components/AITestCaseSlidesDialog.jsx
git commit -m "RXR-11849: Add AITestCaseSlidesDialog slide-card review component"
```

---

## Task 9: Wire "Generate from Story" into TestCasesClient

**Files:**
- Modify: `app/(app)/test-cases/page.js`
- Modify: `app/(app)/test-cases/TestCasesClient.jsx`

- [ ] **Step 1: Pass `aiConfigured` from the RSC page**

Replace `app/(app)/test-cases/page.js`:

```js
import { getServerSession } from 'next-auth';
import { getDb } from '@/lib/mongodb';
import { authOptions } from '@/lib/auth';
import { getTeamSettings } from '@/lib/db/settingsData';
import { isAiConfigured } from '@/lib/server/aiClient';
import TestCasesClient from './TestCasesClient';

export default async function TestCasesPage() {
  const session = await getServerSession(authOptions);
  const db = await getDb();
  const settings = await getTeamSettings(db, session.user.teamId);
  return (
    <TestCasesClient
      user={session.user}
      aiConfigured={isAiConfigured(settings)}
    />
  );
}
```

- [ ] **Step 2: Add `aiConfigured` prop + dialog state to TestCasesClient**

In `TestCasesClient.jsx`:

1. Import the dialog and showToast:

```js
import AITestCaseSlidesDialog from '@/components/AITestCaseSlidesDialog';
import { showToast } from '@/components/Toast';
```

2. Add prop + state:

```js
function TestCasesPage({ user, aiConfigured }) {
  // ... existing state ...
  const [showAiDialog, setShowAiDialog] = useState(false);
```

3. Add "Generate from Story" button next to the existing "+ Add Test Case" button inside the `PageHeader` action:

```jsx
action={
  !isArchived && isAdmin && (
    <Stack direction='row' spacing={1}>
      {aiConfigured && (
        <Button
          variant='outlined'
          size='small'
          onClick={() => setShowAiDialog(true)}
        >
          Generate from Story
        </Button>
      )}
      <Button
        variant='contained'
        size='small'
        onClick={() => setShowAddModal(true)}
      >
        + Add Test Case
      </Button>
    </Stack>
  )
}
```

4. Add the dialog (alongside existing TestCaseDialog):

```jsx
<AITestCaseSlidesDialog
  open={showAiDialog}
  releaseId={releaseId}
  onClose={() => setShowAiDialog(false)}
  onSuccess={(count) => {
    setShowAiDialog(false);
    showToast(`${count} test case${count !== 1 ? 's' : ''} created`, 'success');
    refresh(); // call the existing refresh/reload function
  }}
/>
```

> **Note:** Find the existing function used after adding a test case (likely `loadCases()` or `router.refresh()`) and call the same one in `onSuccess`.

- [ ] **Step 3: Export `TestCasesClient` — confirm the exported function receives the new prop**

The export at the bottom (or the `export default function TestCasesClient`) must include `aiConfigured` in its signature. If the component is exported differently (e.g., via a wrapper), update accordingly.

- [ ] **Step 4: Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass. Fix any broken tests before proceeding.

- [ ] **Step 5: Commit**

```bash
git add app/\(app\)/test-cases/page.js app/\(app\)/test-cases/TestCasesClient.jsx
git commit -m "RXR-11849: Wire AI generate button into test cases page"
```

---

## Task 10: Smoke Test End-to-End

- [ ] **Start dev server:** `npm run dev`
- [ ] **Go to Admin → Settings.** Confirm "AI Test Case Generation" section appears. Select Claude, enter a test API key, save.
- [ ] **Go to Test Cases page.** Confirm "Generate from Story" button appears next to "+ Add Test Case" (admin only).
- [ ] **Click "Generate from Story".** Enter a valid Jira story key that exists in your Jira instance (e.g. `SAP-0428`). Select application + module. Click Generate.
- [ ] **Verify slide cards appear** with AI-generated test cases. Edit a field on one card. Approve it. Skip another.
- [ ] **Click "Create X approved".** Verify the approved cases appear in the test cases list.
- [ ] **Verify Jira story is pre-filled** as the `jiraStory` link on each created test case.
- [ ] **Test with AI disabled:** Remove API key in admin settings. Confirm "Generate from Story" button disappears from the test cases page.

---

## Self-Review Checklist

- ✅ **AI provider constants** defined and used consistently across all tasks
- ✅ **API keys never sent to client** — `/api/settings` strips `aiApiKey` before responding
- ✅ **All 3 providers** (Claude, OpenAI, Gemini) implemented with tests
- ✅ **Jira story fetch** added to jiraClient with ADF plain-text extraction
- ✅ **Generate route** validates input, checks AI configured, guards release ownership
- ✅ **Slide dialog**: setup phase (story + app/module), slides phase (edit/approve/skip), batch create
- ✅ **Button gating**: "Generate from Story" only visible to admins when `aiConfigured`
- ✅ **No new npm packages** required — all AI providers called via fetch
- ✅ **Jira story pre-filled** on created test cases via `jiraStory` field
- ✅ **Tests** for aiClient (all 3 providers + error paths), generate route, settings route, jiraClient
