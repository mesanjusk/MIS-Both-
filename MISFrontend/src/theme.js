import { alpha, createTheme } from '@mui/material/styles';

export const THEME_PRESETS = {
  whatsapp: {
    label: 'WhatsApp Green',
    primary: '#128c7e',
    primaryDark: '#0b5f56',
    primaryLight: '#32b6a6',
    secondary: '#475569',
    background: '#f4f7f6',
    paper: '#ffffff',
    border: '#d8e3e0',
  },
  slate: {
    label: 'Slate Professional',
    primary: '#334155',
    primaryDark: '#0f172a',
    primaryLight: '#64748b',
    secondary: '#0f766e',
    background: '#f8fafc',
    paper: '#ffffff',
    border: '#dbe4ee',
  },
  blue: {
    label: 'Business Blue',
    primary: '#2563eb',
    primaryDark: '#1d4ed8',
    primaryLight: '#60a5fa',
    secondary: '#475569',
    background: '#f5f8ff',
    paper: '#ffffff',
    border: '#dbe7ff',
  },
  maroon: {
    label: 'Maroon Premium',
    primary: '#9f1239',
    primaryDark: '#881337',
    primaryLight: '#fb7185',
    secondary: '#57534e',
    background: '#fff7f7',
    paper: '#ffffff',
    border: '#f3d6dc',
  },
};

export function createAppTheme(themeKey = 'whatsapp') {
  const preset = THEME_PRESETS[themeKey] || THEME_PRESETS.whatsapp;
  const TEXT = '#0f172a';
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
        dark: '#334155',
        light: '#94a3b8',
        contrastText: '#ffffff',
      },
      success: { main: '#16a34a' },
      warning: { main: '#d97706' },
      error: { main: '#dc2626' },
      info: { main: '#0284c7' },
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
          '*::-webkit-scrollbar': { width: 8, height: 8 },
          '*::-webkit-scrollbar-thumb': {
            backgroundColor: alpha(preset.primary, 0.28),
            borderRadius: 999,
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: alpha('#ffffff', 0.92),
            backdropFilter: 'blur(10px)',
            borderBottom: `1px solid ${preset.border}`,
            boxShadow: '0 8px 32px rgba(15, 23, 42, 0.04)',
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            border: `1px solid ${preset.border}`,
            boxShadow: '0 10px 30px rgba(15, 23, 42, 0.05)',
            backgroundImage: 'none',
          },
        },
      },
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            borderRadius: 12,
            textTransform: 'none',
            fontWeight: 700,
            minHeight: 38,
          },
        },
      },
      MuiChip: { styleOverrides: { root: { borderRadius: 999, fontWeight: 600 } } },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            backgroundColor: '#fff',
          },
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

export const lightTheme = createAppTheme('whatsapp');
export default lightTheme;
