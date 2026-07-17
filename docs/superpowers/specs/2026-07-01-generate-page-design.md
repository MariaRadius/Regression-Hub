# Generate Page Design

**Date:** 2026-07-01  
**Ticket:** RXR-12336 (default)  
**Status:** Approved for implementation

---

## Context

The test cases page currently hosts three unrelated concerns in its header: browsing/filtering test cases, Jira story notifications (bell icon), and AI test case generation ("Generate from Story"). The creation and discovery tools are buried in a browse-focused page, making the workflow from "story updated in Jira" → "generate test cases" non-obvious.

This spec moves the Jira notifications bell and "Generate from Story" button to a new dedicated `/generate` page. The test cases page becomes browse/run-only. The new page also surfaces a persistent list of all AI-generated test cases (all-time, cross-release), enabling teams to audit and track what the AI has created.

The `+ Add Test Case` button stays on the test cases page — it is a quick action in context of browsing, not a creation workflow.

---

## Route

| Route | Access | Purpose |
|---|---|---|
| `/generate` | All authenticated users | Jira story hub + AI generation + AI case history |

Nav item added to `TopNav.jsx` with `AutoAwesomeIcon`, visible to all roles (no `adminOnly` flag). AI generation still requires `aiConfigured === true` — the form is shown but the Generate button is disabled with a tooltip if AI is not configured.

---

## Page Layout

```
┌─────────────────────────────────────────────────────────┐
│  GENERATE                                                │
│  Generate Test Cases                                     │
│                                                          │
│  ┌──────────────────────────┐  ┌────────────────────┐   │
│  │  🔔 Jira Stories         │  │  ✨ Generate from   │   │
│  │  ─────────────────       │  │  Story              │   │
│  │  PROJ-123  SSO fix  [→]  │  │  ──────────────     │   │
│  │  PROJ-120  Dashboard[→]  │  │  Story key:         │   │
│  │  PROJ-118  Audit    [→]  │  │  [JIRA-XXX _____]   │   │
│  │                          │  │  App: [Select ▾]    │   │
│  │  [Check now] [Dismiss ✓] │  │  Module: [Select ▾] │   │
│  └──────────────────────────┘  │  [Generate Cases]   │   │
│                                └────────────────────┘   │
│                                                          │
│  AI-Generated Cases  (142)      [Search] [App ▾] [Status]│
│  ──────────────────────────────────────────────────────  │
│  PPO-0251  Access the practice users section...  Pending │
│  PPO-0243  Verify that the Organization Admin... Failed  │
│  [← 1 2 3 … →]                                          │
└─────────────────────────────────────────────────────────┘
```

Left panel and right panel use `Grid` with equal columns (`size={6}`). Panels are MUI `Card` components with consistent padding.

---

## Components

### New: `app/(app)/generate/page.js`
Server RSC. Responsibilities:
- Auth check — redirect to `/login` if unauthenticated
- Fetch `aiConfigured` from team settings (same as test cases `page.js` does today)
- Fetch initial AI-generated cases (first page) for SSR
- Pass `user`, `aiConfigured`, `initialCases`, `initialTotal` as props to `GenerateClient`

### New: `app/(app)/generate/GenerateClient.jsx`
Client shell. Responsibilities:
- Manages `slidesDialogOpen` state (opens `AITestCaseSlidesDialog` after form submission)
- Manages `generationPayload` state (stories array from `GenerateStoryForm`)
- Handles AI cases list refresh after successful generation
- Composes `JiraStoriesPanel`, `GenerateStoryForm`, `AITestCaseSlidesDialog`, and the cases list

### New: `components/JiraStoriesPanel.jsx`
Inline card version of the existing `JiraStoryNotifications` popover.

- Calls the same APIs: `POST /api/jira/sync-story-watches`, `POST /api/jira/acknowledge-story`
- Renders as a scrollable MUI `Card` (max-height ~380px, overflow-y auto)
- Each stale story row: story key chip + summary text + "Generate →" `IconButton`
- "Generate →" calls `onSelectStory(storyKey)` prop — parent pre-fills `GenerateStoryForm`
- Card header: "Jira Stories" title + badge count + "Check now" + "Dismiss all" buttons
- Empty state: MUI icon + "No story updates" message
- Error state: inline Alert if Jira sync fails
- Reuses the fetch/acknowledge logic already in `JiraStoryNotifications` — extract to a custom hook `useJiraStories()` shared by both components

### New: `components/GenerateStoryForm.jsx`
Extracted setup phase from `AITestCaseSlidesDialog.jsx`.

- Props: `initialStoryKey?: string`, `aiConfigured: boolean`, `onGenerate(stories) → void`
- Story key input (with `+` button to add more stories, same multi-story UX as dialog)
- App select + Module select per story (same inline app/module creation as dialog)
- "Generate Test Cases" button — disabled with tooltip if `!aiConfigured`
- On submit: calls `onGenerate(stories)` — parent opens `AITestCaseSlidesDialog` in slides mode
- When `initialStoryKey` changes (from Jira panel click), populates the first story input

### Modified: `components/AITestCaseSlidesDialog.jsx`
Extract setup phase into `GenerateStoryForm`. Dialog now accepts a `stories` prop and starts directly at the **Generating phase** (skips the setup form). Slides review phase is unchanged.

Props change:
```js
// Before
<AITestCaseSlidesDialog open onClose ... />

// After  
<AITestCaseSlidesDialog open onClose stories={[{ storyKey, appId, moduleId }]} ... />
```

When `stories` prop is provided and non-empty, skip the setup UI and call `POST /api/releases/[id]/ai-generate-cases` immediately on open (for each story in sequence), then proceed to the slides review phase. The generating spinner is shown while the API calls are in flight.

The existing trigger in `TestCasesClient.jsx` is removed (see cleanup below).

### Modified: `components/TopNav.jsx`
Add to NAV array:
```js
{ href: '/generate', label: 'Generate', Icon: AutoAwesomeIcon }
```
No `adminOnly` flag. Position: between "Test Cases" and "Releases".

### Modified: `app/(app)/test-cases/TestCasesClient.jsx`
- Remove `<JiraStoryNotifications />` from the page header
- Remove the "Generate from Story" button and `showAiDialog` state
- Remove `<AITestCaseSlidesDialog>` instance and its callbacks
- Remove `aiConfigured` prop (no longer needed client-side)
- Keep `+ Add Test Case` button and `TestCaseDialog`

### Modified: `app/(app)/test-cases/page.js`
Remove `aiConfigured` fetch — no longer passed to client.

---

## Data Model

Add `source` field to the test case schema in `lib/db/testCasesData.js`:

```js
source: { type: String, enum: ['manual', 'ai'], default: 'manual' }
```

When `createTestCaseForRelease` is called from the AI generation approval flow (inside `AITestCaseSlidesDialog`), pass `source: 'ai'`. All other callers (manual add, import) continue to use the default `'manual'`.

The `source` field is **not exposed** in the single-record create/update API (`POST /api/test-cases`, `PATCH /api/test-cases/[id]`) — callers cannot set it; only the AI generation path can write `source: 'ai'`.

---

## API Routes

### New: `GET /api/test-cases/generated` (`app/api/test-cases/generated/route.js`)
Cross-release, team-scoped list of AI-generated test cases.

- Auth: any authenticated user (session required, `proxy.js` handles 401)
- Query params: `page` (default 1), `pageSize` (default 20), `search`, `appId`, `moduleId`, `status`
- Response: `{ cases: [...], total: number }`
- Projection: `id`, `title`, `applicationId`, `moduleId`, `status`, `jiraStory`, `createdAt` — no full step/precondition fields

New data function in `lib/db/testCasesData.js`:
```js
export async function getAiGeneratedTestCases(teamId, { page, pageSize, search, appId, moduleId, status })
```
Queries `{ teamId, source: 'ai' }` with optional filters, sorted by `createdAt` descending.

### Modified: `POST /api/releases/[id]/test-cases`
Accept optional `source` field in request body. When `source: 'ai'` is passed, store it on the document. Validate that `source` is one of `['manual', 'ai']` and defaults to `'manual'` if absent.

---

## AI-Generated Cases List (on Generate page)

- Reuses `TestCaseListItem` for row rendering (same visual style as test cases page)
- Filters: search (title/ID), App dropdown, Status filter chips
- Columns shown per row: ID badge, title, app/module breadcrumb, status dot, Jira story key, created date
- Pagination: 20 per page, standard `TestCasePagination` component
- Row click: navigates to `/test-cases?highlight=[caseId]` — the test cases page scrolls to and highlights that row, opening its detail panel in context of its release

---

## Testing

**Unit tests (new):**
- `lib/db/testCasesData.test.js` — `getAiGeneratedTestCases`: valid query, empty result, filters applied
- `app/api/test-cases/generated/route.test.js` — 200 with cases, 200 empty, filter passthrough, `revalidatePath` mock
- `app/api/releases/[id]/test-cases/route.test.js` — extend existing: verify `source: 'ai'` stored when passed, `source: 'manual'` default when absent
- `components/GenerateStoryForm.test.jsx` — valid submit, disabled state when !aiConfigured, initialStoryKey pre-fill, multi-story add/remove
- `components/JiraStoriesPanel.test.jsx` — renders stories, empty state, onSelectStory callback fires with key

**Smoke test:**  
Update `.claude/skills/smoke-test/SKILL.md` — add `/generate` route to the page walk; verify both panels render and the AI cases list loads.

---

## Verification

1. Navigate to `/generate` — page loads with two-panel layout and empty (or populated) AI cases list
2. Left panel calls Jira sync on mount; stale stories appear; clicking "Generate →" on a story pre-fills the story key field in the right panel
3. Right panel: enter story key, select app/module, click "Generate" — slides dialog opens; approve cases → cases appear in AI-Generated list below
4. Test cases page no longer shows bell icon or "Generate from Story" button
5. `+ Add Test Case` still works on test cases page
6. QA-role user can access `/generate` and use the full page (not just admin)
7. If `aiConfigured === false`, Generate button shows disabled tooltip; Jira panel still works independently
