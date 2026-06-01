# TopNav Release/Environment Selector — Design

**Date:** 2026-06-01
**Status:** Approved (design); implementation pending
**Supersedes:** the `ReleaseContextBar` UI introduced in `2026-05-31-version-release-env-minimal-spec.md`

## Problem

`ReleaseContextBar` is a full-width sticky bar rendered below `TopNav`. It spends a
whole horizontal band on two controls — a release `Autocomplete` and an environment
`ToggleButtonGroup` — plus an archived-warning chip. That is a lot of real-estate for a
small amount of behavior, and it does not appear in the mobile layout the same way.

## Goal

Replace the bar with a **single searchable dropdown** that combines release and
environment into one control, lives inside `TopNav`, and shows on every breakpoint
(including mobile).

- Options read like `2.10.0 / QA`, `2.10.0 / Sandbox`, `2.9.1 / QA` — one row per
  (release × environment) pair.
- No multi-select toggle buttons. No second control.
- Right-aligned in the top bar, near the nav actions — not beside the logo.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Control type | **Searchable combobox** (MUI `Autocomplete`) with flattened pair options — "Design B". |
| Placement | Right side of the `Toolbar`: `…spacer → selector → divider → page-nav icons → profile avatar`. |
| Mobile | Same compact trigger in the top bar (where page-nav icons are hidden); selector still shows. |
| Archived releases | **Dropped entirely.** `listReleases` already feeds only non-archived releases, so archived pairs never appear. Remove the archived chip/warning. |

## Design

### Component boundary

A new client leaf component **`components/ReleaseEnvSelector.jsx`** owns the dropdown.
It is self-contained: it reads and writes the active selection through `useReleaseEnv()`
and needs no props.

- **What it does:** renders an `Autocomplete` of flattened release/env pairs; on change,
  sets both release and environment atomically.
- **How it's used:** `<ReleaseEnvSelector />`, placed inside `TopNav`'s `Toolbar`.
- **What it depends on:** `useReleaseEnv()` for `releases`, `activeRelease`, `environment`,
  and a new `setReleaseEnv` setter.

### Option model

```
options = releases.flatMap((r) =>
  (r.environments ?? []).map((env) => ({
    release: r,
    env,
    key: `${r._id}::${env}`,
    label: `${r.name} / ${env}`,
  })),
)
```

- `getOptionLabel` → `option.label` (drives the collapsed input text, e.g. `2.10.0 / QA`).
- `isOptionEqualToValue` → compares `key`.
- `value` → the option whose `release._id === activeRelease._id && env === environment`,
  or `null` if none resolves.
- `onChange` → `setReleaseEnv(option.release, option.env)`.
- `disableClearable` (there is always an active context once releases exist).

### Context change — `contexts/ReleaseEnvContext.jsx`

Add one atomic setter and expose `releases` so the selector needs no prop drilling:

```
const setReleaseEnv = useCallback((release, env) => {
  if (!release || !env) return;
  if (!release.environments?.includes(env)) return;
  setActiveRelease(release);
  setEnvironmentState(env);
  writeSessionStorage(release._id, env);
}, []);
```

- Add `releases` and `setReleaseEnv` to the context `value` (and to the `useReleaseEnv`
  JSDoc return shape).
- **Remove `setRelease` and `setEnvironment`** from the context. Their only consumer is
  `ReleaseContextBar`, which is being deleted (clean-as-you-go). Combined selection is
  one user action, so the two-step API is no longer needed — `setReleaseEnv` replaces both.
- `resolveInitial` / `readSessionStorage` / `writeSessionStorage` are unchanged. The
  existing archived guards in those helpers stay (harmless defensive validation; the list
  is already non-archived).

### Layout change — `app/(app)/layout.js`

The provider must wrap `TopNav` so the in-nav selector has context. Move
`ReleaseEnvProvider` up to enclose `TopNav` and the `Toolbar` spacer:

```
<ReleaseEnvProvider releases={releases}>
  <TopNav user={user} />
  <Toolbar />
  <Container component='main' maxWidth='lg' sx={{ py: 4 }}>
    {children}
  </Container>
</ReleaseEnvProvider>
```

- Remove the `ReleaseContextBar` import and its `<ReleaseContextBar releases={releases} />`
  render.
- `releases` continues to be fetched server-side (guarded on `user?.teamId`) and passed to
  the provider only. `TopNav` keeps its single `user` prop.

### TopNav change — `components/TopNav.jsx`

Render `<ReleaseEnvSelector />` in the `Toolbar`, on the right, after the `flex:1` spacer
and before the desktop page-nav icon group, separated by a thin vertical divider:

```
<Box sx={{ flex: 1 }} />
<ReleaseEnvSelector />
<Divider orientation='vertical' flexItem sx={{ borderColor: 'rgba(255,255,255,0.12)', mx: 1.5, my: 1.5 }} />
{/* existing desktop page-nav icons (display md:flex) */}
{/* profile avatar */}
```

- The selector renders at all breakpoints (no `display` gating), satisfying "show on mobile".
- The page-nav icon `Stack` keeps its `display: { xs: 'none', md: 'flex' }`; on mobile the
  divider should also collapse with the icons so the selector sits directly before the avatar.

### Styling

Reuse the dark-on-nav `Autocomplete` styling already proven in `ReleaseContextBar`
(translucent white fill, `nav.light` popup paper, teal selected option). Sizing:

- `size='small'`, `minWidth: { xs: 150, sm: 190 }`, `maxWidth: 260`.
- Input text shows the full `2.10.0 / QA` label; truncates with ellipsis if constrained.

### Empty / edge cases

- **No releases (empty list):** render nothing (return `null`). The top bar simply has no
  selector — consistent with there being no working context.
- **Release with no environments:** contributes no options (flatMap yields none); it is not
  selectable. If it is somehow the active release, `value` resolves to `null` and the input
  shows the placeholder.
- **Single pair:** works unchanged; the one option is preselected.
- **Stale sessionStorage:** already handled by `readSessionStorage` validation (unchanged).

## Files touched

| File | Change |
|---|---|
| `components/ReleaseEnvSelector.jsx` | **New** — searchable combined dropdown. |
| `components/ReleaseContextBar.jsx` | **Delete.** |
| `contexts/ReleaseEnvContext.jsx` | Add `setReleaseEnv` + expose `releases`; remove `setRelease`/`setEnvironment`; update JSDoc. |
| `app/(app)/layout.js` | Move `ReleaseEnvProvider` to wrap `TopNav`; remove `ReleaseContextBar`. |
| `components/TopNav.jsx` | Render `<ReleaseEnvSelector />` + divider on the right of the `Toolbar`. |
| `.claude/skills/smoke-test/SKILL.md` | Update line ~383: selector now lives in `TopNav` as one combined dropdown (per the project rule on route/UI-affecting changes). |

## Data Validation

- ReleaseFormDialog.jsx and others + backend: Do not allow "/" character in release name or environment name while creating or updating releases and environments

## Out of scope (YAGNI)

- No grouping by release header (rejected "Design C").
- No archived badge or read-only signalling in the selector.
- No new env color tokens or constants — env text uses the existing nav palette.
- No README change: the release/environment model is unchanged; only the selector's
  presentation moves. (Verify during implementation that README has no `ReleaseContextBar`
  reference — current grep shows none.)

## Testing notes

- The `@see {@link __tests__/TopNav.test.jsx}` tag in `TopNav.jsx` points to a file that does
  not currently exist; no TopNav test will break. Per house rule, new test cases for
  `ReleaseEnvSelector` / the `setReleaseEnv` context method will be proposed to the user
  before being written, not assumed.
- `app/(app)/test-cases/__tests__/TestCasesClient.test.jsx` mocks `useReleaseEnv` with
  `setRelease`/`setEnvironment` fields; those mock fields become dead once the context API
  changes and should be removed in the same change (they are not asserted on).
