import { AI_PROVIDERS } from '@/lib/constants';

// ---- Error normalization ----

/**
 * Maps a failed provider response to a clean, user-facing message.
 * Keeps quota/rate-limit and auth failures readable instead of dumping the
 * provider's raw multi-line error blob into the UI.
 *
 * @param {string} provider - display name (e.g. "Gemini")
 * @param {number} status - HTTP status code
 * @param {string} [detail] - provider-supplied message, if any
 */
function providerError(provider, status, detail) {
  if (status === 429) {
    return new Error(
      `${provider} rate limit or quota reached. Wait a moment and try again, or switch AI providers in Admin settings.`,
    );
  }
  if (status === 401 || status === 403) {
    return new Error(
      `${provider} rejected the API key. Check the AI provider key in Admin settings.`,
    );
  }
  return new Error(`${provider} error: ${detail ?? `HTTP ${status}`}`);
}

// ---- Low-level provider calls ----

async function callClaude(apiKey, system, prompt) {
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
      temperature: 0,
      system,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw providerError('Claude', res.status, errBody?.error?.message);
  }
  const data = await res.json();
  return data.content[0].text;
}

async function callOpenAI(apiKey, system, prompt) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
    }),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw providerError('OpenAI', res.status, errBody?.error?.message);
  }
  const data = await res.json();
  return data.choices[0].message.content;
}

async function callGemini(apiKey, system, prompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0 },
      }),
    },
  );
  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw providerError('Gemini', res.status, errBody?.error?.message);
  }
  const data = await res.json();
  return data.candidates[0].content.parts[0].text;
}

async function callGemma(apiKey, system, prompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemma-4-26b-a4b-it:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0 },
      }),
    },
  );
  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw providerError('Gemma', res.status, errBody?.error?.message);
  }
  const data = await res.json();
  return data.candidates[0].content.parts[0].text;
}

async function callProvider(aiProvider, apiKey, system, prompt) {
  switch (aiProvider) {
    case AI_PROVIDERS.CLAUDE:
      return callClaude(apiKey, system, prompt);
    case AI_PROVIDERS.OPENAI:
      return callOpenAI(apiKey, system, prompt);
    case AI_PROVIDERS.GEMINI:
      return callGemini(apiKey, system, prompt);
    case AI_PROVIDERS.GEMMA:
      return callGemma(apiKey, system, prompt);
    default:
      throw new Error(`Unknown AI provider: ${aiProvider}`);
  }
}

// ---- Shared parser ----

function parseJson(text) {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match)
      throw new Error('AI returned unexpected format — no JSON object found');
    return JSON.parse(match[0]);
  }
}

// ---- Test case generation ----

const QA_SYSTEM =
  'You are a senior QA engineer. Return only valid JSON — no markdown fences, no explanation.';

function buildTestCasePrompt(story) {
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

export function isAiConfigured({ aiProvider, aiApiKey }) {
  return Boolean(aiProvider && aiApiKey);
}

export async function generateTestCasesFromStory(
  { aiProvider, aiApiKey },
  story,
) {
  if (!aiProvider || !aiApiKey) throw new Error('AI provider not configured');
  const text = await callProvider(
    aiProvider,
    aiApiKey,
    QA_SYSTEM,
    buildTestCasePrompt(story),
  );
  const json = parseJson(text);
  if (!Array.isArray(json.testCases))
    throw new Error('AI returned unexpected format — missing testCases array');
  return json.testCases;
}

// ---- Test case impact analysis ----

function buildImpactPrompt({
  oldSummary,
  oldDescription,
  newSummary,
  newDescription,
  acceptanceCriteria,
  existingTestCases,
}) {
  const caseList = existingTestCases
    .map(
      (tc) =>
        `ID (use this exact value in your JSON response): ${tc._id}\nDisplay Key (do NOT use as id): ${tc.testKey ?? 'N/A'}\nTitle: ${tc.testCase}\nPreconditions: ${tc.preconditions || '(none)'}\nSteps: ${tc.steps || '(none)'}\nExpected Result: ${tc.expectedResult || '(none)'}\nPriority: ${tc.priority}\nType: ${tc.type}`,
    )
    .join('\n\n---\n\n');

  const acSection = acceptanceCriteria
    ? `## ACCEPTANCE CRITERIA (current)\n${acceptanceCriteria}`
    : '## ACCEPTANCE CRITERIA\n(none provided)';

  return `A Jira user story has been updated. Identify which existing test cases need to change.

## PREVIOUS STORY
Summary: ${oldSummary || '(none)'}
Description: ${oldDescription || '(none)'}

## UPDATED STORY
Summary: ${newSummary}
Description: ${newDescription || '(none)'}

${acSection}

## EXISTING TEST CASES (${existingTestCases.length} total)
${caseList || '(none)'}

## HOW TO DECIDE — apply the right standard for each type of change

**When the TITLE or DESCRIPTION changed:**
Flag a test case if the underlying requirement it tests has meaningfully changed — e.g. a feature was renamed, a flow was restructured, or a precondition was added/removed. Do NOT flag for cosmetic rewordings that keep the same requirement.

**When an ACCEPTANCE CRITERION changed, was added, or was removed:**
Apply a stricter standard — only flag a test case if there is a direct, one-to-one link between that specific AC and the test case. The test case must explicitly test what that AC requires. Your reason must name the AC that changed.
- AC modified → affectedCases (only the test cases directly testing that AC)
- AC removed → obsoleteCases (only the test cases whose sole purpose was that AC)
- AC added → newCases (only if no existing test case already covers it)

**Default is UNAFFECTED.** When in doubt, leave the test case out of all three lists.

Return a JSON object with exactly these three keys:

"affectedCases": [ { "id": "<exact ID hex, never the Display Key>", "reason": "<plain string>", "update": { "testCase"?: "<new title as plain string>", "preconditions"?: "<new preconditions as plain string>", "steps"?: "<HTML string e.g. <ol><li>Step</li></ol>>", "expectedResult"?: "<new expected result as plain string>", "priority"?: "High"|"Medium"|"Low" } } ]
"newCases": [ { "testCase": "<plain string>", "preconditions": "<plain string>", "steps": "<HTML string>", "expectedResult": "<plain string>", "priority": "High"|"Medium"|"Low", "type": "Functional Test"|"Edge Case"|"Negative Test"|"Security Test" } ]
"obsoleteCases": [ { "id": "<exact ID hex, never the Display Key>", "reason": "<plain string>" } ]

CRITICAL: Every value inside "update" must be a plain string — never an object, never an array. Include only fields that actually need to change.
Each case appears in at most ONE list. Empty arrays when nothing qualifies. Return only valid JSON — no markdown, no explanation.`;
}

export async function analyzeTestCaseImpact(
  { aiProvider, aiApiKey },
  {
    oldSummary,
    oldDescription,
    newSummary,
    newDescription,
    acceptanceCriteria,
    existingTestCases,
  },
) {
  if (!aiProvider || !aiApiKey) throw new Error('AI provider not configured');

  const text = await callProvider(
    aiProvider,
    aiApiKey,
    QA_SYSTEM,
    buildImpactPrompt({
      oldSummary,
      oldDescription,
      newSummary,
      newDescription,
      acceptanceCriteria,
      existingTestCases,
    }),
  );
  const json = parseJson(text);

  if (
    !Array.isArray(json.affectedCases) ||
    !Array.isArray(json.newCases) ||
    !Array.isArray(json.obsoleteCases)
  ) {
    throw new Error(
      'AI returned unexpected format — missing affectedCases, newCases, or obsoleteCases arrays',
    );
  }

  return {
    affectedCases: json.affectedCases,
    newCases: json.newCases,
    obsoleteCases: json.obsoleteCases,
  };
}

// ---- Jira issue improvement ----

const JIRA_IMPROVE_SYSTEM =
  'You are a senior QA engineer writing clear, professional Jira bug reports. Return only valid JSON — no markdown fences, no explanation.';

function buildImprovePrompt({ summary, description }) {
  return `Improve the following Jira issue summary and description for clarity and professionalism.

Current summary:
${summary}

Current description:
${description}

Requirements:
- Keep the summary format as "Application Name: Short descriptive title" if a prefix exists — improve wording but preserve the prefix
- The description must use these ALL-CAPS section headers exactly: DESCRIPTION, STEPS TO REPRODUCE (only if steps exist in the original), EXPECTED RESULT, ACTUAL RESULT
- Keep every factual detail exactly as-is: test keys, IDs, module names, release names, environment, URLs, reporter name
- Improve grammar, specificity, and professional tone
- Return JSON with exactly two keys: "summary" (string) and "description" (string)`;
}

export async function improveJiraIssueDraft(
  { aiProvider, aiApiKey },
  { summary, description },
) {
  if (!aiProvider || !aiApiKey) throw new Error('AI provider not configured');
  const text = await callProvider(
    aiProvider,
    aiApiKey,
    JIRA_IMPROVE_SYSTEM,
    buildImprovePrompt({ summary, description }),
  );
  const json = parseJson(text);
  if (
    typeof json.summary !== 'string' ||
    typeof json.description !== 'string'
  ) {
    throw new Error(
      'AI returned unexpected format — missing summary or description',
    );
  }
  return { summary: json.summary, description: json.description };
}
