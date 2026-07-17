# TopNav Migration Design

**Date:** 2026-05-24  
**Jira:** RXR-11849  
**Status:** Approved

## Overview

Replace the permanent collapsible left `Drawer` sidebar with a top `AppBar` + responsive temporary `Drawer` pattern. Nav items become icon-only `IconButton`s on desktop; admin items and user profile become dropdown `Menu`s. Mobile collapses all nav into a temporary left Drawer.

---

## Layout Shell

`app/(app)/layout.js` changes from a horizontal `Stack` (sidebar + content) to a vertical shell:

- `AppBar` fixed at top (full-width)
- `<main>` with `paddingTop` equal to AppBar height (`{ xs: '56px', sm: '64px' }`) so content is not obscured

`Sidebar.jsx` is deleted. Replaced by `components/TopNav.jsx`.

---

## Component: `TopNav.jsx`

Single `'use client'` component. Receives `user` prop from the server layout.

### AppBar — desktop (`md` and up)

Left to right:

1. **Hamburger** — hidden on desktop (`display: { xs: 'flex', md: 'none' }`), opens mobile Drawer
2. **Brand** — "QA" filled box + "Test Atlas" / "Testing management" text (same visual as current sidebar header)
3. **Nav IconButtons** — visible on desktop (`display: { xs: 'none', md: 'flex' }`). One `Tooltip`-wrapped `IconButton` per NAV item. Active route: `color="primary"`. Inactive: `color="inherit"`.
4. **Spacer** — `Box sx={{ flex: 1 }}`
5. **Admin menu** — `AdminPanelSettingsIcon` `IconButton`, shown only when `user.role === ROLES.ADMIN`. Opens `Menu` with two `MenuItem`s: Users and Import Test Cases (each a Next.js `Link`).
6. **Avatar menu** — `Avatar` with user initials. Opens `Menu` with: name (non-clickable `Typography`), team + role chips (non-clickable), `Divider`, Sign Out `MenuItem`.

### AppBar — mobile (`xs`/`sm`)

- Nav IconButtons hidden
- Hamburger visible on left
- Admin menu and Avatar remain on right

### Mobile Drawer

Temporary, anchored left, closes on any nav click.

Contents:

- Brand header (same "QA" box + text)
- `Divider`
- NAV items as `ListItemButton` (icon + label), active state highlighted
- Admin section (admin only): section label + ADMIN_NAV items

---

## Navigation Config

`NAV` and `ADMIN_NAV` arrays stay in `TopNav.jsx` (no separate config file needed — single consumer).

Active route detection: `pathname === href || pathname.startsWith(href + '/')` — unchanged logic.

---

## Profile Menu Content

```
Rashid H.               ← Typography, disabled MenuItem
● LA Team  ● Admin      ← Chips, disabled MenuItem
────────────────────
Sign Out                ← calls signOut({ callbackUrl: '/login' })
```

---

## Files Changed

| File                     | Change                                                                |
| ------------------------ | --------------------------------------------------------------------- |
| `components/Sidebar.jsx` | Deleted                                                               |
| `components/TopNav.jsx`  | Created                                                               |
| `app/(app)/layout.js`    | Remove `Stack direction='row'`, mount `TopNav`, set main `paddingTop` |

---

## What Is Preserved

- `user` prop flows server → client (layout reads session, passes `user` to `TopNav`)
- `ROLES` constant import
- `locationToChipColor` / `roleToChipColor` theme helpers
- Same route hrefs and active-detection logic
- Admin-only gating on Users + Import Test Cases
