---
name: optimize-page
description: Use when optimizing, debugging, or refactoring a regression-hub app route via dual-phase parallel agents — browser diagnostics, seven-skill code review, and coordinated implementation. Triggered by /optimize-page with a single route argument (e.g. /test-runs).
---

# Optimize Page — regression-hub

## Overview

Dual-phase parallel workflow: live browser diagnostics → seven concurrent reviewer sub-agents → synthesis → concurrent implementor sub-agents → final browser validation.

**Core principle:** The user supplies the route **once**. Every step references derived variables — never repeat the route literal.

**REQUIRED SUB-SKILL:** `dispatching-parallel-agents` for both Phase 1 and Phase 3 dispatches.

## User input

The user provides **one** route path (e.g. `/test-runs`). Parse it and bind variables **once**:

| Variable | Value |
| -------- | ----- |
| `ROUTE` | Exact path from user (leading `/` required) |
| `ROUTE_SEGMENT` | `ROUTE` without leading slash (e.g. `test-runs`) |
| `PAGE_DIR` | `app/(app)/${ROUTE_SEGMENT}/` |
| `PAGE_FILE` | `${PAGE_DIR}page.js` |
| `LOADING_FILE` | `${PAGE_DIR}loading.js` |
| `ERROR_FILE` | `${PAGE_DIR}error.js` |
| `PAGE_URL` | `http://localhost:${PORT}${ROUTE}` |

Discover related files (`lib/*Data.js`, `components/*`, `app/api/${ROUTE_SEGMENT}/`) by search — do not hardcode route strings in prompts.

## Red flags — STOP

- Hardcoding `/test-runs` (or any route) after binding `ROUTE`
- Reading source before Step 1 browser diagnostics complete
- Skipping any of the 7 Phase 1 reviewers ("not relevant" → agent returns N/A, still runs)
- Implementing before Phase 1 reports are collected
- Anticipating or inventing reviewer findings
- Phase 2 implementors editing files outside their assignment
- Sub-agent auditing or editing without reading `CLAUDE.md` first
- Reviewer findings missing Findings, Severity, Implementation Complexity, or Recommended change

| Excuse | Reality |
| ------ | ------- |
| "Remotion doesn't apply" | Agent 6 runs anyway; required output is "N/A — no Remotion usage" with evidence |
| "Browser after code is faster" | Step 1 is mandatory before Phase 1 |
| "I already know the fixes" | Synthesis uses **actual** reviewer reports only |
| "Four reviewers is enough" | All 7 dispatch in parallel — no collapsing |
| "I already know the project rules" | Read `CLAUDE.md` every time — rules evolve; no skipping |

---

## Prerequisites

1. **Dev server** — reuse smoke-test startup (`npm run dev`, poll port). Stop if server fails.
2. **Tests** — run `npm test`; fix failures before optimizing.
3. **Project rules** — main thread reads `CLAUDE.md` before dispatching. Every sub-agent must read it too (see below).

### Project rules (required for every sub-agent)

Path: `CLAUDE.md` (repo root)

Each Phase 1 reviewer and Phase 2 implementor **must read `CLAUDE.md` in full before any audit or edit**. Audits and changes must comply with its constraints (RSC, `lib/*Data.js`, `loading.js` parity, constants, MUI v9, auth/session, API conventions).

### External review skills (read before dispatching)

| Agent | Skill path |
| ----- | ---------- |
| 1 Building Components | `C:/code/next-js-skils/.agents/skills/building-components/SKILL.md` |
| 2 Vercel Composition | `C:/code/next-js-skils/.agents/skills/vercel-composition-patterns/SKILL.md` |
| 3 Web Design Guidelines | `C:/code/next-js-skils/.agents/skills/web-design-guidelines/SKILL.md` |
| 4 Next Best Practices | `C:/code/next-js-skils/.agents/skills/next-best-practices/SKILL.md` |
| 5 Vercel React Best Practices | `C:/code/next-js-skils/.agents/skills/vercel-react-best-practices/SKILL.md` |
| 6 Remotion Best Practices | `C:/code/next-js-skils/.agents/skills/remotion-best-practices/SKILL.md` |
| 7 Frontend Design | `C:/code/next-js-skils/.agents/skills/frontend-design/SKILL.md` |

Each reviewer agent **must read `CLAUDE.md` and its assigned skill file** before auditing.

---

## Step 1 — Browser diagnostics (main thread)

Before Phase 1, run live diagnostics on `PAGE_URL`:

1. Navigate to `PAGE_URL` (sign in as admin if middleware requires — use smoke-test credentials).
2. **Network:** `list_network_requests` — slow payloads, redundant fetches, failed requests.
3. **Console:** `list_console_messages` types `error`, `warn` — hydration mismatches, runtime errors.
4. **DOM:** `take_snapshot` — rendered structure (no screenshots).

Save as `DIAGNOSTICS` (structured summary). Attach to every Phase 1 agent prompt.

---

## Step 2 — Phase 1: concurrent reviewers

Dispatch **7 parallel** Task sub-agents (one per skill above). Each prompt is self-contained:

```markdown
Route: ${ROUTE}
Page files: ${PAGE_FILE}, ${LOADING_FILE}, ${ERROR_FILE}, [discovered related files]
Browser diagnostics: [paste DIAGNOSTICS]
Required reading (in order):
1. CLAUDE.md — project rules and constraints; comply with all applicable rules
2. [path to assigned SKILL.md] — audit lens for this agent
Task: Audit ${ROUTE} against this skill only. Flag any violations of CLAUDE.md.

Return one entry per finding. Every finding must include all four fields:

- Findings (concrete, file:line where possible)
- Severity: P1 | P2 | P3
- Implementation Complexity: H | M | L
- Recommended change (specific, no implementation)

Severity scale: P1 = highest (must fix — broken flow, security, data integrity, user-facing bug); P2 = should fix in this pass (clear UX/perf/maintainability gap); P3 = nice-to-have polish.

Implementation Complexity scale: H = multi-file refactor, architectural change, or high regression risk; M = localized change across 1–2 files; L = trivial/single-location fix.

Do NOT edit files. Do NOT guess other agents' findings. Do not use Priority or H/M/L Severity — Severity is P1/P2/P3 only.
```

Wait for all 7 reports before Step 3. Reject incomplete reports missing any required field on a finding.

---

## Step 3 — Synthesis & Phase 2 implementors

### 3a Synthesis (main thread)

Aggregate **only actual** Phase 1 findings. Dedupe overlapping items. Do not add speculative items.

Prioritize `WORK_PLAN` items by Severity (P1 first), then Implementation Complexity (L first within same severity — quick wins before heavy lifts).

Merge with these **mandatory Core Optimization Directives** for `${ROUTE}`:

- **RSC:** Server-side data fetching; client components at leaves; serializable props from server.
- **Performance & DB:** Eliminate N+1; minimize select fields; `react` cache / Next fetch cache where applicable; queries in `lib/*Data.js`.
- **Streaming & errors:** Localized `loading.js` (or `<Suspense>`) matching settled layout; `error.js` boundary for runtime failures.

Output: prioritized `WORK_PLAN` — each item names target file(s), exact change, Severity (P1/P2/P3), and Implementation Complexity (H/M/L).

### 3b Phase 2: concurrent implementors

Split `WORK_PLAN` into independent file/subsystem slices. Dispatch parallel implementor agents — **one slice each**, no overlap.

Each implementor prompt:

```markdown
Route: ${ROUTE}
Assignment: [single slice from WORK_PLAN]
Required reading: CLAUDE.md — read in full before editing; all changes must comply
Constraints: minimal diff; loading.js must match page layout
Return: files changed, summary of changes, tests run
```

When implementors return, main thread resolves conflicts, runs `npm test`, fixes integration issues.

Update `.claude/skills/smoke-test/SKILL.md` if route behavior, gating, or exports changed.

---

## Step 4 — Final browser validation (main thread)

1. Re-open `PAGE_URL`.
2. Confirm Step 1 console errors/warnings are resolved.
3. Confirm network bottlenecks and redundant fetches are fixed or explained.
4. `take_snapshot` — verify structure matches expectations.

Report: before/after diagnostics comparison, WORK_PLAN completion status, remaining items.

---

## Usage

```
/optimize-page /test-runs
```

Only `/test-runs` is user-supplied; the orchestrator binds `ROUTE` and derives everything else.
