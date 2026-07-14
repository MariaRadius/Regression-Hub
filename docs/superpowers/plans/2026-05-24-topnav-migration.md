# TopNav Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the permanent collapsible left Drawer sidebar with a fixed top AppBar containing icon-only nav buttons, an admin dropdown, a profile/avatar dropdown, and a temporary mobile Drawer.

**Architecture:** A single `TopNav.jsx` client component receives `user` from the server layout, owns all AppBar + Drawer state, and replaces `Sidebar.jsx` entirely. The `(app)/layout.js` shell switches from a horizontal `Stack` to a vertical column with a `<Toolbar />` spacer pushing main content below the fixed AppBar.

**Tech Stack:** MUI v9 — `AppBar`, `Toolbar`, `Drawer`, `Menu`, `MenuItem`, `Avatar`, `Tooltip`, `IconButton`, `List`, `ListItemButton`; Next.js `Link`; next-auth `signOut`; `usePathname`

---

## File Map

| File                     | Action | Responsibility                                                                 |
| ------------------------ | ------ | ------------------------------------------------------------------------------ |
| `components/TopNav.jsx`  | Create | Full top nav: AppBar, desktop icons, admin menu, profile menu, mobile Drawer   |
| `app/(app)/layout.js`    | Modify | Mount `TopNav`, add `<Toolbar />` spacer, remove `Stack direction='row'` shell |
| `components/Sidebar.jsx` | Delete | Replaced entirely by TopNav                                                    |

---

### Task 1: AppBar shell + brand + layout wiring

Create the bare AppBar with brand only. Wire the layout. No nav items yet.

**Files:**

- Create: `components/TopNav.jsx`
- Modify: `app/(app)/layout.js`

- [ ] **Step 1: Create `components/TopNav.jsx` with AppBar shell and brand**

```jsx
'use client';

import MenuIcon from '@mui/icons-material/Menu';
import {
  AppBar,
  Box,
  IconButton,
  Stack,
  Toolbar,
  Typography,
} from '@mui/material';
import { useState } from 'react';

const DRAWER_WIDTH = 240;

/** @see {@link __tests__/TopNav.test.jsx} */
export default function TopNav({ user }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <AppBar position='fixed' sx={{ bgcolor: 'nav.main' }}>
        <Toolbar>
          {/* Hamburger — mobile only */}
          <IconButton
            color='inherit'
            edge='start'
            onClick={() => setMobileOpen(true)}
            sx={{ mr: 2, display: { md: 'none' } }}
            aria-label='open navigation'
          >
            <MenuIcon />
          </IconButton>

          {/* Brand */}
          <Stack direction='row' spacing={1} alignItems='center' sx={{ mr: 3 }}>
            <Stack
              sx={{
                width: 32,
                height: 32,
                bgcolor: 'primary.main',
                borderRadius: 1,
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Typography
                sx={{ color: 'white', fontWeight: 700, fontSize: 13 }}
              >
                QA
              </Typography>
            </Stack>
            <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
              <Typography
                variant='navBrand'
                sx={{ color: 'white', display: 'block' }}
              >
                Test Atlas
              </Typography>
              <Typography
                variant='metricSub'
                sx={{ color: 'rgba(255,255,255,0.5)', display: 'block' }}
              >
                Testing management
              </Typography>
            </Box>
          </Stack>

          {/* Nav items — placeholder spacer for now */}
          <Box sx={{ flex: 1 }} />
        </Toolbar>
      </AppBar>
    </>
  );
}
```

- [ ] **Step 2: Update `app/(app)/layout.js`**

Replace the `Stack direction='row'` shell with a vertical layout. Import `TopNav` instead of `Sidebar`. Add `<Toolbar />` spacer so content isn't hidden behind the fixed AppBar.

```js
import Box from '@mui/material/Box';
import Toolbar from '@mui/material/Toolbar';
import { getServerSession } from 'next-auth';
import TopNav from '@/components/TopNav';
import { authOptions } from '@/lib/auth';

export default async function AppLayout({ children }) {
  const session = await getServerSession(authOptions);
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <TopNav user={session.user} />
      <Toolbar />
      <Box component='main' sx={{ flex: 1, p: 3.5, overflow: 'auto' }}>
        {children}
      </Box>
    </Box>
  );
}
```

- [ ] **Step 3: Verify the app loads with brand visible in AppBar**

Run: `npm run dev`
Expected: AppBar at top shows "QA" box + "Test Atlas". Content sits below the bar. No sidebar.

- [ ] **Step 4: Commit**

```bash
git add components/TopNav.jsx app/(app)/layout.js
git commit -m "RXR-11849: scaffold TopNav AppBar shell + rewire layout

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Desktop nav IconButtons with active state

Add icon-only nav buttons to the AppBar, visible on `md`+ screens. Hidden on mobile.

**Files:**

- Modify: `components/TopNav.jsx`

- [ ] **Step 1: Add nav config + imports at the top of `TopNav.jsx`**

Add these imports (merge with existing):

```jsx
import AssessmentIcon from '@mui/icons-material/Assessment';
import AssignmentIcon from '@mui/icons-material/Assignment';
import BugReportIcon from '@mui/icons-material/BugReport';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PlaylistPlayIcon from '@mui/icons-material/PlaylistPlay';
import { Tooltip } from '@mui/material';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
```

Add nav config after imports, before the component:

```jsx
const NAV = [
  { href: '/dashboard', label: 'Dashboard', Icon: DashboardIcon },
  { href: '/test-cases', label: 'Test Cases', Icon: BugReportIcon },
  { href: '/assignments', label: 'Assignments', Icon: AssignmentIcon },
  { href: '/test-runs', label: 'Test Runs', Icon: PlaylistPlayIcon },
  { href: '/reports', label: 'Reports', Icon: AssessmentIcon },
];
```

- [ ] **Step 2: Add `usePathname` + `isActive` helper inside the component, and desktop nav buttons in the Toolbar**

Inside `TopNav`, add after the `useState` calls:

```jsx
const pathname = usePathname();
const isActive = (href) => pathname === href || pathname.startsWith(href + '/');
```

Replace `{/* Nav items — placeholder spacer for now */}` with:

```jsx
{/* Desktop nav */}
<Stack direction='row' spacing={0.5} sx={{ display: { xs: 'none', md: 'flex' } }}>
  {NAV.map(({ href, label, Icon }) => (
    <Tooltip key={href} title={label}>
      <IconButton
        component={Link}
        href={href}
        color={isActive(href) ? 'primary' : 'inherit'}
        size='small'
        aria-label={label}
      >
        <Icon />
      </IconButton>
    </Tooltip>
  ))}
</Stack>

<Box sx={{ flex: 1 }} />
```

- [ ] **Step 3: Verify on desktop**

Run: `npm run dev`
Expected: Five nav icons appear in the AppBar. Active route icon is highlighted in primary color. Hovering shows tooltip label. Icons are hidden when viewport is narrower than `md` (960px).

- [ ] **Step 4: Commit**

```bash
git add components/TopNav.jsx
git commit -m "RXR-11849: add desktop nav IconButtons with active-route highlight

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Admin dropdown menu

Add an `AdminPanelSettingsIcon` IconButton that opens a `Menu` with Users and Import Test Cases items. Shown only when `user.role === ROLES.ADMIN`.

**Files:**

- Modify: `components/TopNav.jsx`

- [ ] **Step 1: Add admin imports**

Add to the existing import block:

```jsx
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import PeopleIcon from '@mui/icons-material/People';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { ListItemIcon, ListItemText, Menu, MenuItem } from '@mui/material';
import { ROLES } from '@/lib/constants';
```

Add `ADMIN_NAV` config after `NAV`:

```jsx
const ADMIN_NAV = [
  { href: '/users', label: 'Users', Icon: PeopleIcon },
  { href: '/import-cases', label: 'Import Test Cases', Icon: UploadFileIcon },
];
```

- [ ] **Step 2: Add `adminAnchor` state + admin menu JSX**

Inside the component, add state:

```jsx
const [adminAnchor, setAdminAnchor] = useState(null);
```

After `<Box sx={{ flex: 1 }} />` and before the closing `</Toolbar>`, add:

```jsx
{
  /* Admin menu — visible to admins only */
}
{
  user?.role === ROLES.ADMIN && (
    <>
      <Tooltip title='Admin'>
        <IconButton
          color='inherit'
          onClick={(e) => setAdminAnchor(e.currentTarget)}
          aria-label='admin menu'
        >
          <AdminPanelSettingsIcon />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={adminAnchor}
        open={Boolean(adminAnchor)}
        onClose={() => setAdminAnchor(null)}
      >
        {ADMIN_NAV.map(({ href, label, Icon }) => (
          <MenuItem
            key={href}
            component={Link}
            href={href}
            onClick={() => setAdminAnchor(null)}
          >
            <ListItemIcon>
              <Icon fontSize='small' />
            </ListItemIcon>
            <ListItemText>{label}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
```

- [ ] **Step 3: Verify admin menu**

Log in as an admin user. Expected: shield icon appears in AppBar. Clicking it opens a menu with "Users" and "Import Test Cases". Clicking either navigates and closes the menu. Non-admin users see no shield icon.

- [ ] **Step 4: Commit**

```bash
git add components/TopNav.jsx
git commit -m "RXR-11849: add admin dropdown menu (Users + Import Test Cases)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Profile / Avatar dropdown menu

Add an `Avatar` with user initials on the right of the AppBar. Clicking it opens a menu showing name, team chip, role chip, divider, and Sign Out.

**Files:**

- Modify: `components/TopNav.jsx`

- [ ] **Step 1: Add profile imports**

Add to the existing import block:

```jsx
import LogoutIcon from '@mui/icons-material/Logout';
import { Avatar, Chip, Divider } from '@mui/material';
import { signOut } from 'next-auth/react';
import { locationToChipColor, roleToChipColor } from '@/app/theme';
```

- [ ] **Step 2: Add `profileAnchor` state + initials helper**

Inside the component, add:

```jsx
const [profileAnchor, setProfileAnchor] = useState(null);

const userInitials =
  user?.name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) ?? '?';
```

- [ ] **Step 3: Add Avatar button + profile menu JSX**

After the admin menu block (still inside `<Toolbar>`), add:

```jsx
{/* Profile menu */}
<Tooltip title='Account'>
  <IconButton
    onClick={(e) => setProfileAnchor(e.currentTarget)}
    size='small'
    sx={{ ml: 1 }}
    aria-label='account menu'
  >
    <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: 13 }}>
      {userInitials}
    </Avatar>
  </IconButton>
</Tooltip>
<Menu
  anchorEl={profileAnchor}
  open={Boolean(profileAnchor)}
  onClose={() => setProfileAnchor(null)}
  slotProps={{ paper: { sx: { minWidth: 200 } } }}
>
  <MenuItem disabled sx={{ opacity: '1 !important' }}>
    <Stack spacing={0.75}>
      <Typography variant='tableCell' sx={{ fontWeight: 600 }}>
        {user?.name}
      </Typography>
      <Stack direction='row' spacing={0.75} sx={{ flexWrap: 'wrap' }}>
        <Chip
          label={user?.teamName}
          color={locationToChipColor(user?.teamId)}
          size='small'
          variant='outlined'
        />
        <Chip
          label={user?.role === ROLES.ADMIN ? 'Admin' : 'QA'}
          color={roleToChipColor(user?.role)}
          size='small'
          variant='outlined'
        />
      </Stack>
    </Stack>
  </MenuItem>
  <Divider />
  <MenuItem onClick={() => signOut({ callbackUrl: '/login' })}>
    <ListItemIcon>
      <LogoutIcon fontSize='small' />
    </ListItemIcon>
    <ListItemText>Sign Out</ListItemText>
  </MenuItem>
</Menu>
```

- [ ] **Step 4: Verify profile menu**

Expected: Avatar with initials appears on the right. Clicking opens menu showing name, two chips, a divider, and "Sign Out". Clicking Sign Out redirects to `/login`.

- [ ] **Step 5: Commit**

```bash
git add components/TopNav.jsx
git commit -m "RXR-11849: add Avatar profile menu with name, chips, and sign out

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 5: Mobile Drawer

Wire the hamburger to a temporary left Drawer containing all nav items with icon + label. Closes on any nav click.

**Files:**

- Modify: `components/TopNav.jsx`

- [ ] **Step 1: Add Drawer + List imports**

Add to the existing import block (merge, don't duplicate):

```jsx
import { Drawer, List, ListItemButton, ListItemText } from '@mui/material';
```

- [ ] **Step 2: Add `drawerContent` variable inside the component**

Add before the `return` statement:

```jsx
const drawerContent = (
  <Box sx={{ width: DRAWER_WIDTH, bgcolor: 'nav.main', minHeight: '100%' }}>
    {/* Brand header */}
    <Stack
      direction='row'
      spacing={1}
      alignItems='center'
      sx={{ px: 2, py: 1.75, minHeight: 64 }}
    >
      <Stack
        sx={{
          width: 32,
          height: 32,
          bgcolor: 'primary.main',
          borderRadius: 1,
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Typography sx={{ color: 'white', fontWeight: 700, fontSize: 13 }}>
          QA
        </Typography>
      </Stack>
      <Box>
        <Typography
          variant='navBrand'
          sx={{ color: 'white', display: 'block' }}
        >
          Test Atlas
        </Typography>
        <Typography
          variant='metricSub'
          sx={{ color: 'rgba(255,255,255,0.5)', display: 'block' }}
        >
          Testing management
        </Typography>
      </Box>
    </Stack>

    <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />

    <List dense sx={{ py: 1 }}>
      {NAV.map(({ href, label, Icon }) => (
        <ListItemButton
          key={href}
          component={Link}
          href={href}
          selected={isActive(href)}
          onClick={() => setMobileOpen(false)}
          sx={{
            mx: 1,
            borderRadius: 1,
            mb: 0.25,
            '&.Mui-selected': { bgcolor: 'rgba(255,255,255,0.12)' },
            '&:hover': { bgcolor: 'rgba(255,255,255,0.07)' },
          }}
        >
          <ListItemIcon sx={{ color: 'rgba(255,255,255,0.75)', minWidth: 36 }}>
            <Icon fontSize='small' />
          </ListItemIcon>
          <ListItemText
            primary={label}
            slotProps={{
              primary: { variant: 'navItem', sx: { color: 'white' } },
            }}
          />
        </ListItemButton>
      ))}

      {user?.role === ROLES.ADMIN && (
        <>
          <Typography
            variant='metricLabel'
            sx={{
              display: 'block',
              px: 2,
              pt: 1.5,
              pb: 0.5,
              color: 'rgba(255,255,255,0.3)',
            }}
          >
            Admin
          </Typography>
          {ADMIN_NAV.map(({ href, label, Icon }) => (
            <ListItemButton
              key={href}
              component={Link}
              href={href}
              selected={isActive(href)}
              onClick={() => setMobileOpen(false)}
              sx={{
                mx: 1,
                borderRadius: 1,
                mb: 0.25,
                '&.Mui-selected': { bgcolor: 'rgba(255,255,255,0.12)' },
                '&:hover': { bgcolor: 'rgba(255,255,255,0.07)' },
              }}
            >
              <ListItemIcon
                sx={{ color: 'rgba(255,255,255,0.75)', minWidth: 36 }}
              >
                <Icon fontSize='small' />
              </ListItemIcon>
              <ListItemText
                primary={label}
                slotProps={{
                  primary: { variant: 'navItem', sx: { color: 'white' } },
                }}
              />
            </ListItemButton>
          ))}
        </>
      )}
    </List>
  </Box>
);
```

Add `Divider` to the import list at the top (it's already used in the profile menu step — just verify it's included).

- [ ] **Step 3: Add the temporary Drawer after the closing `</AppBar>` tag**

```jsx
{
  /* Mobile Drawer */
}
<Drawer
  variant='temporary'
  open={mobileOpen}
  onClose={() => setMobileOpen(false)}
  ModalProps={{ keepMounted: true }}
  sx={{
    display: { xs: 'block', md: 'none' },
    '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' },
  }}
>
  {drawerContent}
</Drawer>;
```

- [ ] **Step 4: Verify mobile Drawer**

Resize browser to below 960px. Expected: hamburger appears. Desktop nav icons disappear. Tapping hamburger slides in a dark Drawer with icon + label nav items. Tapping any item navigates and closes the Drawer. Active item is highlighted.

- [ ] **Step 5: Commit**

```bash
git add components/TopNav.jsx
git commit -m "RXR-11849: add mobile temporary Drawer with icon+label nav items

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 6: Delete Sidebar.jsx

Remove the old sidebar component and its now-orphaned test reference.

**Files:**

- Delete: `components/Sidebar.jsx`

- [ ] **Step 1: Delete the file**

```bash
git rm components/Sidebar.jsx
```

- [ ] **Step 2: Verify no remaining imports**

```bash
grep -r "Sidebar" app/ components/ lib/ --include="*.{js,jsx,ts,tsx}"
```

Expected: zero results.

- [ ] **Step 3: Commit**

```bash
git commit -m "RXR-11849: remove Sidebar — replaced by TopNav

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 7: Lint

- [ ] **Step 1: Run lint fix**

```bash
npm run lint:fix
```

Expected: exits 0. Any auto-fixed import ordering is fine. Fix any remaining errors manually if reported.

- [ ] **Step 2: Commit if lint made changes**

```bash
git add -A
git commit -m "RXR-11849: lint fixes

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

Expected: only import order / formatting changes. If ESLint reports a logic error, fix it and re-run before committing.
