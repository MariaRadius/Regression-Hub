# Regression Hub Rules

## Auth and Session

- auth and role checks MUST happen server-side in `page.js`, before any render or data fetch — unauthorized users are redirected at the server level, never filtered client-side
- session data flows one way: server reads the session, passes `user` as a prop to the client leaf — client components never read the session directly
- role-dependent UI and access decisions are driven by the `user` prop passed from the server, not by client-side session state

## Documentation and Spec Discipline

- DO NOT bloat README.md — every line must prevent a concrete mistake; cut anything that doesn't
- DO NOT implement a feature before updating README.md — treat it as the spec-first feature list

## Git and Commit Hygiene

- DO NOT commit without a Jira ID prefix (e.g. "RXR-1234: <message>")

## API Route Conventions

- DO NOT return an empty body `{}` on 401 responses; return `{ error: 'Unauthorized' }` to match the shape of all other error responses in the codebase
- when an API route handler accepts a caller-supplied field from `session.user` (e.g. `teamId`), guard against falsy values before passing to DB queries

## Reuse and Code Organization

- DO NOT duplicate a DB query between an RSC page and its API route; extract to `lib/[name]Data.js` — both page and route import from the shared module
- DO NOT inline JSX blocks, hook logic, or utility patterns that duplicate an existing implementation in another page file; extract to `components/`, `hooks/`, or `utils/` before the second use
- DO NOT redefine a function locally if it is already exported from utils/; import from the shared module instead
- DO NOT set font-family outside app/globals.css; self-host via app/fonts.js (next/font/google), no CDN links, no inline fontFamily props

## Testing Scope and Minimum Coverage

- DO NOT test AWS SDK/framework internals, platform wiring, private methods, call order, or runtime-owned config; if a behavior-preserving refactor breaks a test, the test is wrong — delete or fix it
- when writing unit tests, cover at minimum: valid input → expected output, invalid input → specific error, dependency failure → handled error, one edge case per unit; mock AWS SDKs, network calls, databases, ConfigService env vars, and framework APIs

## SSR and Router Patterns

- prefer SSR (async RSC + server-side data fetch) over client-side fetching for all page-level data — eliminates loading skeletons, reduces RTT, and keeps sensitive query logic off the client
- when an RSC page is refreshed client-side via `router.refresh()`, add `export const dynamic = 'force-dynamic'` to the page so the server re-runs the query on every refresh

## Superpowers Workflow

- when writing utils, hooks, or components, invoke /test-driven-development before writing implementation code
