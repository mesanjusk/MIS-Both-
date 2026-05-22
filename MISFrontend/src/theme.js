import { alpha, createTheme } from '@mui/material/styles';

export const THEME_PRESETS = {
  mint: {
    label: 'Pastel Green',
    primary: '#16a34a',
    primaryDark: '#15803d',
    primaryLight: '#4ade80',
    secondary: '#0d9488',
    background: '#f9fffe',
    paper: '#ffffff',
    surface: '#f0fdf4',
    border: '#d1fae5',
  },
  rose: {
    label: 'Rose Petal',
    primary: '#C4687E',
    primaryDark: '#A04E64',
    primaryLight: '#E09AAA',
    secondary: '#8F6B72',
    background: '#FFF5F8',
    paper: '#ffffff',
    surface: '#FFF5F8',
    border: '#F2C8D2',
  },
  sky: {
    label: 'Sky Mist',
    primary: '#5189C4',
    primaryDark: '#3569A0',
    primaryLight: '#88B4DC',
    secondary: '#6B7E8F',
    background: '#F2F7FD',
    paper: '#ffffff',
    surface: '#F2F7FD',
    border: '#C4D8EE',
  },
  lavender: {
    label: 'Lavender',
    primary: '#7B6EC0',
    primaryDark: '#5C52A0',
    primaryLight: '#A89CDC',
    secondary: '#7E6B8F',
    background: '#F6F4FD',
    paper: '#ffffff',
    surface: '#F6F4FD',
    border: '#D0C8EE',
  },
  peach: {
    label: 'Peach Dusk',
    primary: '#C47B52',
    primaryDark: '#A05C36',
    primaryLight: '#DCA888',
    secondary: '#8F7A6B',
    background: '#FDF6F1',
    paper: '#ffffff',
    surface: '#FDF6F1',
    border: '#EED0B8',
  },
};

export function createAppTheme(themeKey = 'mint') {
  const preset = THEME_PRESETS[themeKey] || THEME_PRESETS.mint;
  const TEXT = '#1a2332';
  const TEXT_SECONDARY = '#52687a';

  return createTheme({
    palette: {
      mode: 'light',
      primary: {
        main: preset.primary,
        dark: preset.primaryDark,
        light: preset.primaryLight,
        contrastText: '#ffffff',
      },
      secondary: {
        main: preset.secondary,
        dark: '#4a5568',
        light: '#a0aec0',
        contrastText: '#ffffff',
      },
      success: { main: '#1E9E5A', light: '#D1FAE5', dark: '#14734A' },
      warning: { main: '#D97706', light: '#FEF3C7', dark: '#B45309' },
      error:   { main: '#DC2626', light: '#FEE2E2', dark: '#B91C1C' },
      info:    { main: '#2563EB', light: '#DBEAFE', dark: '#1D4ED8' },
      background: {
        default: preset.background,
        paper: preset.paper,
      },
      text: {
        primary: TEXT,
        secondary: TEXT_SECONDARY,
      },
      divider: preset.border,
    },
    shape: { borderRadius: 12 },
    typography: {
      fontFamily: "Inter, Roboto, 'Segoe UI', Arial, sans-serif",
      fontSize: 13,
      h4: { fontSize: '1.65rem', fontWeight: 800, letterSpacing: '-0.01em' },
      h5: { fontSize: '1.1rem',  fontWeight: 800 },
      h6: { fontSize: '1rem',    fontWeight: 700 },
      subtitle1: { fontSize: '0.95rem', fontWeight: 700 },
      subtitle2: { fontSize: '0.88rem', fontWeight: 700 },
      body2: { fontSize: '0.83rem' },
      caption: { fontSize: '0.74rem' },
      button: { fontWeight: 700, letterSpacing: '0.01em' },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          html: { height: '100%' },
          body: { height: '100%', backgroundColor: preset.background },
          '#root': { height: '100%' },
          '*::-webkit-scrollbar': { width: 5, height: 5 },
          '*::-webkit-scrollbar-thumb': {
            backgroundColor: alpha(preset.primary, 0.25),
            borderRadius: 999,
          },
          '*::-webkit-scrollbar-track': { background: 'transparent' },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: alpha('#ffffff', 0.96),
            backdropFilter: 'blur(14px)',
            borderBottom: `1px solid ${preset.border}`,
            boxShadow: '0 1px 8px rgba(15,23,42,0.05)',
            color: TEXT,
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: '#FFFFFF',
            borderRight: `1px solid ${preset.border}`,
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            border: `1px solid ${preset.border}`,
            boxShadow: '0 1px 8px rgba(15,23,42,0.05), 0 1px 2px rgba(15,23,42,0.04)',
            backgroundImage: 'none',
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: { backgroundImage: 'none' },
          outlined: { borderColor: preset.border },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            borderRadius: 9,
            textTransform: 'none',
            fontWeight: 700,
            minHeight: 36,
          },
          containedPrimary: {
            background: `linear-gradient(135deg, ${preset.primary} 0%, ${preset.primaryDark} 100%)`,
            '&:hover': {
              background: `linear-gradient(135deg, ${preset.primaryDark} 0%, ${preset.primaryDark} 100%)`,
            },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: 7, fontWeight: 600 },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 9,
            backgroundColor: '#FFFFFF',
            '& fieldset': { borderColor: preset.border },
            '&:hover fieldset': { borderColor: preset.primary },
          },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 700,
            minHeight: 44,
          },
        },
      },
      MuiTableHead: {
        styleOverrides: {
          root: {
            '& .MuiTableCell-root': {
              backgroundColor: alpha(preset.primary, 0.06),
              fontWeight: 700,
              color: TEXT,
              borderBottom: `2px solid ${preset.border}`,
            },
          },
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: {
            '&:hover': { backgroundColor: alpha(preset.primary, 0.03) },
          },
        },
      },
      MuiBottomNavigation: {
        styleOverrides: {
          root: {
            borderTop: `1px solid ${preset.border}`,
            backgroundColor: 'transparent',
            height: 64,
          },
        },
      },
      MuiBottomNavigationAction: {
        styleOverrides: {
          root: {
            minWidth: 48,
            '&.Mui-selected': { color: preset.primary },
            '& .MuiBottomNavigationAction-label': {
              fontSize: '0.65rem',
              fontWeight: 600,
            },
          },
        },
      },
      MuiFab: {
        styleOverrides: {
          root: {
            boxShadow: `0 4px 14px ${alpha(preset.primary, 0.35)}`,
          },
        },
      },
      MuiSwitch: {
        styleOverrides: {
          switchBase: {
            '&.Mui-checked': { color: preset.primary },
            '&.Mui-checked + .MuiSwitch-track': { backgroundColor: preset.primary },
          },
        },
      },
    },
  });
}

export const lightTheme = createAppTheme('mint');
export default lightTheme;
