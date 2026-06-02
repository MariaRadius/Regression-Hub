# Regression Hub Rules

> **"Clean as you go"** — rules marked with this tag require opportunistic cleanup: whenever a task touches a file that violates that rule, fix the violation in the same commit. No separate cleanup pass needed; just don't leave the old practice in files you're already editing.

## Auth and Session

- DO NOT add login/session auth guards outside `proxy.js`; unauthenticated redirect logic lives only in `proxy.js`. Clean as you go
- API authentication (401) is enforced in `proxy.js`; route handlers MUST NOT re-check `!session`. Handlers still call `getServerSession` to read `session.user` for role/team checks. Clean as you go
- DO NOT alter `proxy.js` matcher's `api/auth` exclusion; NextAuth's own endpoints (`/api/auth/*`) MUST bypass the proxy or signin breaks
- auth and role checks MUST happen server-side in `page.js`, before any render or data fetch — unauthorized users are redirected at the server level, never filtered client-side. Clean as you go
- session data flows one way: server reads the session, passes `user` as a prop to the client leaf — client components never read the session directly. Clean as you go
- role-dependent UI and access decisions are driven by the `user` prop passed from the server, not by client-side session state. Clean as you go

## Documentation and Spec Discipline

- when adding, changing, or removing a feature that affects routes, role gating, mutations, exports, or polling, update `.claude/skills/smoke-test/SKILL.md` in the same commit
- DO NOT bloat README.md — every line must prevent a concrete mistake; cut anything that doesn't
- DO NOT implement a feature before updating README.md — treat it as the spec-first feature list

## Git and Commit Hygiene

- DO NOT commit without a Jira ID prefix (e.g. "RXR-1234: <message>")

## API Route Conventions

- DO NOT return an empty body `{}` on 401 responses; return `{ error: 'Unauthorized' }` to match the shape of all other error responses in the codebase
- when an API route handler accepts a caller-supplied field from `session.user` (e.g. `teamId`), guard against falsy values before passing to DB queries
- DO NOT accept `softwareVersionTested` on the single-record create (`POST /api/test-cases`) or update (`PATCH /api/test-cases/[id]`); it is settable only via Excel import or version restore/retag. Clean as you go

## Reuse and Code Organization

- DO NOT apply pre-v9 MUI patterns (direct system props, Grid xs/sm/md props, InputLabelProps, inputProps, TransitionProps, MenuListProps); use MUI v9 equivalents (sx, Grid size prop, slotProps.<slotName>). Clean as you go
- when encountering MUI v9 API friction, consult <https://mui.com/material-ui/migration/upgrade-to-v9.md> before attempting workarounds
- DO NOT write DB queries inline in `page.js` or API route files — always extract to `lib/[name]Data.js` and import from there, even when only one caller exists today. Clean as you go
- DO NOT hardcode domain enum literals (status, roles, priorities, assignment status, unassigned sentinel, confirm tokens); import from `@/lib/constants`. Clean as you go
- DO NOT inline JSX blocks, hook logic, or utility patterns that duplicate an existing implementation in another page file; extract to `components/`, `hooks/`, or `utils/` before the second use. Clean as you go
- DO NOT redefine a function locally if it is already exported from utils/; import from the shared module instead
- DO NOT reference an MUI icon by name without first verifying the exact export name exists in `@mui/icons-material`
- DO NOT set font-family outside app/globals.css; self-host via app/fonts.js (next/font/google), no CDN links, no inline fontFamily props
- ALWAYS set `slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}` on a labeled TextField select that has a `<MenuItem value=''>`. `displayEmpty` renders the empty-value item (otherwise it shows blank); `inputLabel.shrink` floats the label into the notch so it never overlaps the placeholder. Clean as you go
- DO NOT use ad-hoc or plain-text empty states; compose them with an MUI icon, bold title Typography, a subtitle Typography, and a primary MUI Button to go back
- DO NOT use Box as a flex/grid layout wrapper; use Stack (spacing prop) or Grid for layout containers. Clean as you go
- DO NOT use custom margin or padding values in sx; prefer MUI native `spacing={}` on Stack and `spacing`/`rowSpacing`/`columnSpacing` on Grid unless no native equivalent exists. Clean as you go
- DO NOT use raw SVG or unicode emojis as icons; use MUI icons (`@mui/icons-material`) instead

## Testing Scope and Minimum Coverage

- DO NOT test AWS SDK or framework internals, platform wiring, private methods, call order, or runtime-owned configuration. Tests must verify observable behavior; if a behavior-preserving refactor breaks a test, the test is brittle and must be fixed or removed.
- when a route calls `revalidatePath` or `revalidateTag`, add `vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))` to that route's test file — these require Next.js server runtime context absent in vitest/jsdom
- when writing unit tests, cover at minimum: valid input → expected output, invalid input → specific error, dependency failure → handled error, one edge case per unit; mock AWS SDKs, network calls, databases, ConfigService env vars, and framework APIs

## SSR and Router Patterns

- DO NOT call `unstable_cache` inside a per-invocation wrapper function; hoist to a module-level `const` and pass dynamic values (e.g. `teamId`) as function arguments
- DO NOT use `next/dynamic` with `ssr: false` in RSC pages; extract the dynamic import into a `'use client'` wrapper component
- DO NOT fetch page-level data client-side; use async RSC with server-side data fetching — eliminates loading skeletons, reduces RTT, and keeps sensitive query logic off the client
- DO NOT let a `loading.js` skeleton's layout diverge from the settled page; each skeleton block must match its rendered counterpart's dimensions, spacing, and grid position exactly — any page layout change requires an equal update to `loading.js`
- DO NOT pass full server records/documents to client components; queries MUST project (select only the fields the client renders) and pass that minimal shape as props
- when an RSC page is refreshed client-side via `router.refresh()`, add `export const dynamic = 'force-dynamic'` to the page so the server re-runs the query on every refresh
- when exposing cached data through an API route (e.g. `/api/dashboard`), set `Cache-Control` to at least `private, max-age=60, stale-while-revalidate=300` to align with the `unstable_cache` TTL
- when wrapping DB queries with `unstable_cache`, add `revalidatePath` to every mutation route that affects that page's data — not just the primary mutation route

## Chrome DevTools

- DO NOT use the CDP screenshot tool; pass `includeSnapshot: true` on any CDP tool call instead to get the snapshot inline (e.g. `press_key(key: "Escape", includeSnapshot: true)`) — faster and uses fewer tokens

## Superpowers Workflow

- when writing utils, hooks, or components, invoke /test-driven-development before writing implementation code
