import { AI_PROVIDERS } from '@/lib/constants';

const SYSTEM =
  'You are a senior QA engineer. Return only valid JSON — no markdown fences, no explanation.';

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
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    const json = JSON.parse(cleaned);
    if (!Array.isArray(json.testCases))
      throw new Error(
        'AI returned unexpected format — missing testCases array',
      );
    return json.testCases;
  } catch {
    // Model wrapped JSON in prose — extract the object literal
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match)
      throw new Error('AI returned unexpected format — no JSON object found');
    const json = JSON.parse(match[0]);
    if (!Array.isArray(json.testCases))
      throw new Error(
        'AI returned unexpected format — missing testCases array',
      );
    return json.testCases;
  }
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
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
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
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: buildPrompt(story) }] }],
      }),
    },
  );
  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    const msg = errBody?.error?.message ?? `HTTP ${res.status}`;
    throw new Error(`Gemini: ${msg}`);
  }
  const data = await res.json();
  return parseResponse(data.candidates[0].content.parts[0].text);
}

async function callGemma(apiKey, story) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemma-4-26b-a4b-it:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: buildPrompt(story) }] }],
      }),
    },
  );
  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    const msg = errBody?.error?.message ?? `HTTP ${res.status}`;
    throw new Error(`Gemma: ${msg}`);
  }
  const data = await res.json();
  return parseResponse(data.candidates[0].content.parts[0].text);
}

export function isAiConfigured({ aiProvider, aiApiKey }) {
  return Boolean(aiProvider && aiApiKey);
}

export async function generateTestCasesFromStory(
  { aiProvider, aiApiKey },
  story,
) {
  if (!aiProvider || !aiApiKey) throw new Error('AI provider not configured');
  switch (aiProvider) {
    case AI_PROVIDERS.CLAUDE:
      return callClaude(aiApiKey, story);
    case AI_PROVIDERS.OPENAI:
      return callOpenAI(aiApiKey, story);
    case AI_PROVIDERS.GEMINI:
      return callGemini(aiApiKey, story);
    case AI_PROVIDERS.GEMMA:
      return callGemma(aiApiKey, story);
    default:
      throw new Error(`Unknown AI provider: ${aiProvider}`);
  }
}
