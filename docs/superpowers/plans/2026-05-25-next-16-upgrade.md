# Next.js 16 Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the app from Next.js 15.2.6 to 16.2.6 and React 18 to 19.2, adopting idiomatic Next.js 16 patterns: `proxy.js` auth gate with JWT-claim forwarding, and Turbopack-native canvas resolution.

**Architecture:** Three targeted changes. (1) Bump `next`, `react`, `react-dom` — ESLint config is intentionally excluded (Biome migration is in a parallel track). (2) Replace `middleware.js` with an idiomatic `proxy.js`: authentication gate only, JWT claims forwarded as request headers so downstream RSC pages and `withTeam.js` don't re-decode the token unnecessarily. (3) Remove the custom `webpack` callback in `next.config.js` and replace it with Turbopack's `resolveAlias` — the documented way to silence a Node.js-only native package (`canvas`) from browser bundles.

**Tech Stack:** Next.js 16.2.6, React 19.2, next-auth 4 (JWT strategy), Turbopack (default in v16), Vitest.

---

## Architecture boundary: what proxy.js owns vs what it doesn't

```
Request
  │
  ▼
proxy.js          ← AUTHENTICATION only
  │                 Is there a valid JWT?
  │                 • No  → redirect /login  (or 401 for /api/*)
  │                 • Yes → forward JWT claims as request headers, pass through
  │
  ▼
RSC page.js       ← AUTHORIZATION (role / team)
withTeam.js         getServerSession(authOptions) reads session.user.{teamId,role}
                    These already work; no change needed in this upgrade.
```

**Why forward JWT claims as headers?**
`teamId`, `role`, `username` are already embedded in the JWT by the `jwt` callback in `lib/auth.js`. `proxy.js` decodes the token once via `getToken` and writes the values into `x-user-*` request headers. RSC pages and `withTeam.js` still call `getServerSession` for the full session object — forwarding is additive, not a replacement.

**What proxy.js must never do:**

- DB lookups (too slow, wrong layer)
- Role-based routing decisions (authorization ≠ authentication)
- Mutate session state

---

## Context

**Current state**

| Item                  | Value                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------- |
| `next`                | `^15.2.6`                                                                             |
| `react` / `react-dom` | `^18`                                                                                 |
| Proxy/middleware file | `middleware.js` — export `middleware`, export `config`                                |
| `next.config.js`      | Has custom `webpack` callback: `canvas → false` on `!isServer`                        |
| JWT claims            | `sub`, `teamId`, `teamName`, `username`, `role` (set in `lib/auth.js` `jwt` callback) |

**Breaking changes that apply to this project**

| Change                                                                 | File(s)                      |
| ---------------------------------------------------------------------- | ---------------------------- |
| `middleware.js` deprecated → `proxy.js`; export `middleware` → `proxy` | `middleware.js` → `proxy.js` |
| Turbopack is default; custom `webpack` callback breaks build           | `next.config.js`             |
| React 18 → React 19.2 peer requirement                                 | `package.json`               |
| `CLAUDE.md` rules name `middleware.js` explicitly                      | `CLAUDE.md`                  |

**ESLint / `eslint-config-next`:** intentionally excluded — Biome migration is in a parallel track.

**Changes confirmed NOT needed (pre-scan):**

- Async Request APIs — `params`/`searchParams` already awaited everywhere
- `next/headers` — not used anywhere
- AMP, `next/legacy/image`, `serverRuntimeConfig`, `experimental_ppr`, parallel routes, `revalidateTag`, `unstable_cacheLife/cacheTag` — none present
- `next lint` removal — project already uses `eslint .` directly
- `--turbopack` flags — scripts already use plain `next dev` / `next build`
- Node.js minimum — running v24.14.0, well above v20.9

---

## File Map

| File              | Action | Why                                                                    |
| ----------------- | ------ | ---------------------------------------------------------------------- |
| `package.json`    | Modify | Bump `next`, `react`, `react-dom`                                      |
| `middleware.js`   | Delete | Replaced by `proxy.js`                                                 |
| `proxy.js`        | Create | Auth gate + JWT-claim header forwarding (idiomatic Next.js 16)         |
| `canvas-empty.js` | Create | Turbopack `resolveAlias` browser target for the `canvas` native module |
| `next.config.js`  | Modify | Remove `webpack` fn; add `turbopack.resolveAlias` for canvas           |
| `CLAUDE.md`       | Modify | Update three rules that reference `middleware.js` → `proxy.js`         |

---

## Task 1: Upgrade dependencies

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Edit `package.json` — bump three packages**

  In `"dependencies"`, change:

  ```json
  "next": "^16.2.6",
  "react": "^19.2.0",
  "react-dom": "^19.2.0",
  ```

  Leave `eslint-config-next` and every other dependency untouched.

- [ ] **Step 2: Install**

  ```bash
  npm install
  ```

  > **Peer-dep note:** Some packages (`notistack`, `recharts`, MUI ecosystem) may print peer-dependency warnings about React 19. Warnings are fine — npm still installs. If you see a hard `ERESOLVE` error, re-run with `npm install --legacy-peer-deps` and note which packages need future attention. Do not blindly upgrade unrelated packages to fix warnings.

  Expected: install completes, no `npm ERR!` lines.

- [ ] **Step 3: Verify the resolved Next.js version**

  ```bash
  node -e "console.log(require('./node_modules/next/package.json').version)"
  ```

  Expected output: `16.2.6`

- [ ] **Step 4: Commit**

  ```bash
  git add package.json package-lock.json
  git commit -m "RXR-11849: upgrade next 15→16, react 18→19.2"
  ```

---

## Task 2: Replace middleware.js with idiomatic proxy.js

**Files:**

- Delete: `middleware.js`
- Create: `proxy.js`
- Modify: `CLAUDE.md`

> **Why the rewrite, not just a rename:** `proxy.js` runs in the `nodejs` runtime in Next.js 16 (not edge). The authentication logic is the same, but the idiomatic pattern is to forward decoded JWT claims as request headers so downstream RSC pages and `withTeam.js` don't pay for a redundant `getToken` call. The `config` named export (matcher) is unchanged.

- [ ] **Step 1: Create `proxy.js` at the project root**

  ```js
  import { NextResponse } from 'next/server';
  import { getToken } from 'next-auth/jwt';

  /**
   * Authentication proxy — the single point of truth for route access control.
   *
   * Scope (this file): AUTHENTICATION — is there a valid, unexpired JWT?
   *
   * Out of scope (do NOT add here):
   *   - Role checks  → app/(app)/**/page.js  via getServerSession(authOptions)
   *   - Team checks  → lib/server/withTeam.js via getServerSession(authOptions)
   *   - DB lookups   → wrong layer, too slow
   *
   * JWT claims (teamId, role, username) are forwarded as x-user-* request
   * headers so downstream code can read them without re-decoding the token.
   * Downstream callers still use getServerSession for the full session object;
   * these headers are additive, not a replacement.
   */
  export async function proxy(req) {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    const { pathname, searchParams } = req.nextUrl;

    // ── Unauthenticated ──────────────────────────────────────────────────────
    if (!token) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (pathname !== '/login') {
        const loginUrl = req.nextUrl.clone();
        loginUrl.pathname = '/login';
        loginUrl.searchParams.set('redirectTo', pathname);
        return NextResponse.redirect(loginUrl);
      }
      return NextResponse.next();
    }

    // ── Authenticated, hitting /login ────────────────────────────────────────
    if (pathname === '/login') {
      const target = searchParams.get('redirectTo') || '/dashboard';
      return NextResponse.redirect(new URL(target, req.url));
    }

    // ── Authenticated, normal request ────────────────────────────────────────
    // Forward decoded JWT claims as request headers.
    // These are readable in RSC via `import { headers } from 'next/headers'`
    // and in API route handlers via `req.headers.get('x-user-*')`.
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set('x-user-id', String(token.sub ?? ''));
    requestHeaders.set('x-user-role', String(token.role ?? ''));
    requestHeaders.set('x-user-team-id', String(token.teamId ?? ''));
    requestHeaders.set('x-user-username', String(token.username ?? ''));

    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  export const config = {
    matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
  };
  ```

- [ ] **Step 2: Delete `middleware.js`**

  ```bash
  rm middleware.js
  ```

- [ ] **Step 3: Update `CLAUDE.md` — update three rules that name `middleware.js`**

  The three affected lines are at lines 7–9 of `CLAUDE.md`. Replace them with:

  ```
  - DO NOT add login/session auth guards outside `proxy.js`; unauthenticated redirect logic lives only in `proxy.js`. Clean as you go
  - API authentication (401) is enforced in `proxy.js`; route handlers MUST NOT re-check `!session`. Handlers still call `getServerSession` to read `session.user` for role/team checks. Clean as you go
  - DO NOT alter `proxy.js` matcher's `api/auth` exclusion; NextAuth's own endpoints (`/api/auth/*`) MUST bypass the proxy or signin breaks
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add proxy.js middleware.js CLAUDE.md
  git commit -m "RXR-11849: replace middleware.js with idiomatic proxy.js; forward JWT claims as x-user-* headers"
  ```

---

## Task 3: Migrate webpack canvas config to Turbopack

**Files:**

- Create: `canvas-empty.js`
- Modify: `next.config.js`

> **Context:** `jspdf` is loaded client-side via `await import('jspdf')` inside `utils/pdfHelpers.js`, which is called from `'use client'` components. `jspdf` contains a top-level `require('canvas')` for optional server-side rendering support. In a browser bundle, `canvas` is a Node.js native module that doesn't exist — Turbopack (like webpack before it) fails when it tries to bundle it. The fix: tell Turbopack to resolve `canvas` to an empty browser module. This is documented in the Next.js 16 upgrade guide as the idiomatic `resolveAlias` pattern for Node.js-only packages that leak into client bundles.

- [ ] **Step 1: Create `canvas-empty.js` at the project root**

  ```js
  // Browser stub for the `canvas` native Node.js module.
  // jspdf imports `canvas` for optional server-side rendering; it is never
  // needed in browser bundles. Turbopack's resolveAlias points here instead.
  module.exports = {};
  ```

- [ ] **Step 2: Rewrite `next.config.js` — remove `webpack`, add `turbopack.resolveAlias`**

  Replace the entire file:

  ```js
  /** @type {import('next').NextConfig} */

  const securityHeaders = [
    { key: 'X-DNS-Prefetch-Control', value: 'on' },
    { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    {
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=()',
    },
    {
      key: 'Strict-Transport-Security',
      value: 'max-age=63072000; includeSubDomains; preload',
    },
    {
      key: 'Content-Security-Policy',
      value: [
        "default-src 'self'",
        "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self'",
        "connect-src 'self'",
        "frame-ancestors 'self'",
      ].join('; '),
    },
  ];

  const nextConfig = {
    reactStrictMode: true,
    serverExternalPackages: ['mongodb'],
    transpilePackages: ['jspdf', 'jspdf-autotable'],
    experimental: {
      // Rewrite MUI barrel imports to direct subpath imports at build time.
      // Without this, Next's __barrel_optimize__ loader hits "conflicting star
      // exports" against MUI v9's dual ESM/CJS bundles on Linux (Vercel).
      optimizePackageImports: ['@mui/material', '@mui/icons-material'],
    },
    turbopack: {
      // canvas is a Node.js native module used by jspdf for server-side
      // rendering. It must not be bundled into browser builds. Map it to an
      // empty stub so Turbopack doesn't fail when jspdf tries to require it.
      resolveAlias: {
        canvas: { browser: './canvas-empty.js' },
      },
    },

    async headers() {
      return [{ source: '/(.*)', headers: securityHeaders }];
    },
  };

  module.exports = nextConfig;
  ```

- [ ] **Step 3: Run a production build**

  ```bash
  npm run build 2>&1
  ```

  Expected: `✓ Compiled` — no webpack-conflict warning, no `canvas` module-not-found error.

  If you see `Module not found: Can't resolve 'canvas'`, confirm `canvas-empty.js` exists at the project root (same directory as `next.config.js`).

- [ ] **Step 4: Commit**

  ```bash
  git add next.config.js canvas-empty.js
  git commit -m "RXR-11849: replace webpack canvas alias with Turbopack resolveAlias"
  ```

---

## Task 4: Verify and close

- [ ] **Step 1: Run the test suite**

  ```bash
  npm run test
  ```

  Expected: all tests pass. If any fail with React 19 API changes, report the specific test name and error — do not skip silently.

- [ ] **Step 2: Run lint**

  ```bash
  npm run lint:fix
  ```

  Expected: no errors. Deprecation warnings from `next-auth` internals in `node_modules` are acceptable.

- [ ] **Step 3: Commit any lint-generated changes**

  Only if `lint:fix` modified files:

  ```bash
  git add -A
  git commit -m "RXR-11849: apply lint:fix after Next.js 16 upgrade"
  ```

- [ ] **Step 4: Final build sanity check**

  ```bash
  npm run build 2>&1 | tail -20
  ```

  Expected: `✓ Compiled` — zero errors, all routes compile.

---

## Self-Review

### Spec coverage

| Requirement                                  | Task   |
| -------------------------------------------- | ------ |
| Bump `next`, `react`, `react-dom`            | Task 1 |
| ESLint intentionally excluded (Biome track)  | —      |
| `middleware.js` → `proxy.js` (file + export) | Task 2 |
| JWT claim forwarding (`x-user-*` headers)    | Task 2 |
| CLAUDE.md rule updates                       | Task 2 |
| Turbopack default / webpack conflict         | Task 3 |
| Canvas resolveAlias (idiomatic Turbopack)    | Task 3 |
| Verify build, tests, lint                    | Task 4 |

### Items confirmed NOT needed

- Async Request API codemod — already async everywhere
- `unstable_` prefix removal — `unstable_cacheLife`/`unstable_cacheTag` not used
- `experimental_ppr` removal — not used
- AMP, `next/legacy/image`, `serverRuntimeConfig` — not used
- Parallel route `default.js` — no `@`-slot directories exist
- Opengraph/icon async params — no such files
- `revalidateTag` second-arg update — not used
- `next lint` removal — already using `eslint .` directly
