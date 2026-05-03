import { alpha, createTheme } from '@mui/material/styles';

export const THEME_PRESETS = {
  mint: {
    label: 'Mint Breeze',
    primary: '#4A9E82',
    primaryDark: '#2E7A61',
    primaryLight: '#7ECBB2',
    secondary: '#6B8F8A',
    background: '#F2FAF7',
    paper: '#ffffff',
    border: '#C8E8DC',
  },
  rose: {
    label: 'Rose Petal',
    primary: '#C4687E',
    primaryDark: '#A04E64',
    primaryLight: '#E09AAA',
    secondary: '#8F6B72',
    background: '#FFF5F8',
    paper: '#ffffff',
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
    border: '#EED0B8',
  },
};

export function createAppTheme(themeKey = 'mint') {
  const preset = THEME_PRESETS[themeKey] || THEME_PRESETS.mint;
  const TEXT = '#1a2332';
  const TEXT_SECONDARY = '#64748b';

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
      success: { main: '#3a9e6a' },
      warning: { main: '#c9820a' },
      error: { main: '#c94040' },
      info: { main: '#3a7ec9' },
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
    shape: { borderRadius: 14 },
    typography: {
      fontFamily: "Inter, Roboto, 'Segoe UI', Arial, sans-serif",
      fontSize: 13,
      h4: { fontSize: '1.7rem', fontWeight: 800 },
      h5: { fontSize: '1.08rem', fontWeight: 800 },
      h6: { fontSize: '0.98rem', fontWeight: 700 },
      subtitle1: { fontSize: '0.95rem', fontWeight: 700 },
      subtitle2: { fontSize: '0.88rem', fontWeight: 700 },
      body2: { fontSize: '0.83rem' },
      caption: { fontSize: '0.75rem' },
      button: { fontWeight: 700 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          html: { height: '100%' },
          body: { height: '100%' },
          '#root': { height: '100%' },
          '*::-webkit-scrollbar': { width: 6, height: 6 },
          '*::-webkit-scrollbar-thumb': {
            backgroundColor: alpha(preset.primary, 0.22),
            borderRadius: 999,
          },
          '*::-webkit-scrollbar-track': { background: 'transparent' },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: alpha('#ffffff', 0.94),
            backdropFilter: 'blur(12px)',
            borderBottom: `1px solid ${preset.border}`,
            boxShadow: '0 2px 12px rgba(15, 23, 42, 0.04)',
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            border: `1px solid ${preset.border}`,
            boxShadow: '0 2px 12px rgba(15, 23, 42, 0.04)',
            backgroundImage: 'none',
          },
        },
      },
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            borderRadius: 10,
            textTransform: 'none',
            fontWeight: 700,
            minHeight: 36,
          },
        },
      },
      MuiChip: { styleOverrides: { root: { borderRadius: 8, fontWeight: 600 } } },
      MuiOutlinedInput: {
        styleOverrides: {
          root: { borderRadius: 10, backgroundColor: '#fff' },
        },
      },
      MuiBottomNavigation: {
        styleOverrides: {
          root: {
            borderTop: `1px solid ${preset.border}`,
            backgroundColor: alpha('#ffffff', 0.97),
            backdropFilter: 'blur(10px)',
          },
        },
      },
    },
  });
}

export const lightTheme = createAppTheme('mint');
export default lightTheme;
