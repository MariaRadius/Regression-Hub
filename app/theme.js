import { createTheme } from '@mui/material/styles';
import { PRIORITIES, ROLES, TEAMS } from '@/lib/constants';

// CSS variable references for fonts set by app/fonts.js
const fontBody = 'var(--font-body)';
const fontHeading = 'var(--font-heading)';
const fontMono = 'var(--font-mono)';

const theme = createTheme({
  shape: {
    borderRadius: 10,
  },

  palette: {
    primary: {
      main: '#0d9488', // --accent
      dark: '#0f766e', // --accent-hover
    },
    secondary: {
      main: '#0891b2', // --accent-2
    },
    text: {
      primary: '#111827', // --ink
      secondary: '#374151', // --ink-2
      disabled: '#6b7280', // --muted
    },
    divider: '#e5e7eb', // --line
    background: {
      paper: '#ffffff', // --surface
      default: '#f9fafb', // --surface-2
    },
    grey: {
      100: '#f3f4f6', // --surface-3
      300: '#d1d5db', // --line-2
      500: '#9ca3af', // --ink-3
      600: '#4b5563', // --ink-3
      700: '#374151', // --ink-2
    },
    success: {
      main: '#03a769', // --pass
      light: '#e9fbf3', // --pass-bg
    },
    error: {
      main: '#e14d5a', // --fail
      light: '#fff1f3', // --fail-bg
    },
    warning: {
      main: '#f08d2f', // --pending
      light: '#fff3e7', // --pending-bg
    },
    info: {
      main: '#6366f1', // --known-issue
      light: '#eef2ff', // --known-issue-bg
    },
    // Custom keys
    nav: {
      main: '#0f172a', // --nav
      light: '#1e293b', // --nav-2
      dark: '#334155', // --nav-3
    },
    pass: {
      main: '#03a769', // --pass
      light: '#e9fbf3', // --pass-bg
      border: '#b7efd6', // --pass-border
    },
    fail: {
      main: '#e14d5a', // --fail
      light: '#fff1f3', // --fail-bg
      border: '#f6c2c9', // --fail-border
    },
    pending: {
      main: '#f08d2f', // --pending
      light: '#fff3e7', // --pending-bg
      border: '#f7cc9d', // --pending-border
    },
    knownIssue: {
      main: '#6366f1', // --known-issue
      light: '#eef2ff', // --known-issue-bg
      border: '#c7d2fe', // --known-issue-border
    },
  },

  shadows: [
    'none',
    '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)', // [1] --shadow-sm
    '0 4px 12px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.04)', // [2] --shadow
    '0 1px 5px rgba(0,0,0,0.07), 0 1px 3px rgba(0,0,0,0.05)',
    '0 10px 28px rgba(0,0,0,0.09), 0 4px 8px rgba(0,0,0,0.05)', // [4] --shadow-lg
    '0 1px 8px rgba(0,0,0,0.08)',
    '0 2px 10px rgba(0,0,0,0.08)',
    '0 2px 12px rgba(0,0,0,0.08)',
    '0 2px 14px rgba(0,0,0,0.09)',
    '0 2px 16px rgba(0,0,0,0.09)',
    '0 3px 18px rgba(0,0,0,0.09)',
    '0 3px 20px rgba(0,0,0,0.09)',
    '0 3px 22px rgba(0,0,0,0.09)',
    '0 3px 24px rgba(0,0,0,0.10)',
    '0 4px 26px rgba(0,0,0,0.10)',
    '0 4px 28px rgba(0,0,0,0.10)',
    '0 4px 30px rgba(0,0,0,0.10)',
    '0 5px 32px rgba(0,0,0,0.11)',
    '0 5px 34px rgba(0,0,0,0.11)',
    '0 5px 36px rgba(0,0,0,0.11)',
    '0 6px 38px rgba(0,0,0,0.12)',
    '0 6px 40px rgba(0,0,0,0.12)',
    '0 6px 42px rgba(0,0,0,0.12)',
    '0 7px 44px rgba(0,0,0,0.13)',
    '0 7px 46px rgba(0,0,0,0.13)',
  ],

  typography: {
    fontFamily: fontBody,
    fontFamilyHeading: fontHeading,
    fontFamilyMono: fontMono,
    fontSize: 14,
    // Custom variants
    pageEyebrow: {
      fontSize: 11,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
    },
    pageTitle: {
      fontSize: 24,
      fontWeight: 700,
      lineHeight: 1.2,
      letterSpacing: '-0.01em',
      fontFamily: fontHeading,
    },
    pageSub: {
      fontSize: 14,
      fontWeight: 400,
      lineHeight: 1.5,
    },
    panelTitle: {
      fontSize: 16,
      fontWeight: 600,
      lineHeight: 1.4,
      fontFamily: fontHeading,
    },
    metricLabel: {
      fontSize: 11,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
    },
    metricValue: {
      fontSize: 28,
      fontWeight: 700,
      lineHeight: 1.1,
      fontVariantNumeric: 'tabular-nums',
      fontFamily: fontHeading,
    },
    metricSub: {
      fontSize: 12,
      fontWeight: 400,
    },
    mono: {
      fontFamily: fontMono,
      fontSize: 13,
      fontWeight: 700,
      letterSpacing: '0.02em',
    },
    tableHeader: {
      fontSize: 11,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
    },
    tableCell: {
      fontSize: 13,
      fontWeight: 400,
      lineHeight: 1.5,
    },
    chipLabel: {
      fontSize: 11,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
    },
    navBrand: {
      fontSize: 14,
      fontWeight: 700,
      letterSpacing: '0.04em',
    },
    navItem: {
      fontSize: 14,
      fontWeight: 500,
    },
    formLabel: {
      fontSize: 12,
      fontWeight: 500,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      color: '#4b5563',
    },
    emptyStateTitle: {
      fontSize: 14,
      fontWeight: 500,
    },
    errorBanner: {
      fontSize: 13,
      fontWeight: 500,
    },
  },

  components: {
    MuiTypography: {
      defaultProps: {
        variantMapping: {
          pageEyebrow: 'span',
          pageTitle: 'h1',
          pageSub: 'p',
          panelTitle: 'h2',
          metricLabel: 'span',
          metricValue: 'div',
          metricSub: 'span',
          mono: 'span',
          tableHeader: 'span',
          tableCell: 'span',
          chipLabel: 'span',
          navBrand: 'span',
          navItem: 'span',
          formLabel: 'span',
          emptyStateTitle: 'p',
          errorBanner: 'p',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          fontFamily: fontHeading,
          textTransform: 'none',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        label: {
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: 'rgba(0,0,0,0.6)',
        },
        body: {
          fontSize: 13,
        },
      },
    },
    MuiDialogActions: {
      styleOverrides: {
        root: {
          // MUI default is 8px; match DialogContent's 24px horizontal inset
          padding: '16px 24px',
        },
      },
    },
    MuiCssBaseline: {
      styleOverrides: {
        'h1, h2, h3, h4, h5, h6': {
          margin: 0,
        },
      },
    },
  },
});

export default theme;

/**
 * Maps a test priority string to an MUI color token.
 *
 * @see {@link app/__tests__/theme.mappers.test.js}
 */
export function priorityToColor(priority) {
  if (priority === PRIORITIES.HIGH) return 'error';
  if (priority === PRIORITIES.LOW) return 'success';
  return 'warning'; // Medium, null, undefined
}

/**
 * Maps a user role to an MUI Chip color token.
 * Derived from ROLE_STYLE in app/(app)/users/UsersClient.jsx.
 *
 * @see {@link app/__tests__/theme.mappers.test.js}
 */
export function roleToChipColor(role) {
  // admin → primary (#0d9488 teal), qa → secondary (#0891b2 cyan)
  if (role === ROLES.ADMIN) return 'primary';
  return 'secondary'; // qa or unknown
}

/**
 * Maps a teamId to an MUI Chip color token.
 * Derived from LOCATION_STYLE in app/(app)/users/UsersClient.jsx
 * and LOCATION_COLOR in components/Sidebar.jsx.
 *
 * @see {@link app/__tests__/theme.mappers.test.js}
 */
export function locationToChipColor(teamId) {
  // radius → primary (#0d9488 teal), cb → secondary (#6366f1 indigo mapped to secondary)
  if (teamId === TEAMS.CB) return 'secondary';
  return 'primary'; // radius or unknown
}
