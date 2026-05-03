import { createContext, useContext, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { createAppTheme, THEME_PRESETS } from '../theme';

const STORAGE_KEY = 'mis_dashboard_theme_key';
const DEFAULT_THEME = 'mint';
const ThemeConfigContext = createContext({
  themeKey: DEFAULT_THEME,
  setThemeKey: () => {},
  themeOptions: THEME_PRESETS,
});

export function AppThemeProvider({ children }) {
  const [themeKey, setThemeKeyState] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return (stored && THEME_PRESETS[stored]) ? stored : DEFAULT_THEME;
  });
  const theme = useMemo(() => createAppTheme(themeKey), [themeKey]);

  const setThemeKey = (next) => {
    const safeKey = THEME_PRESETS[next] ? next : DEFAULT_THEME;
    localStorage.setItem(STORAGE_KEY, safeKey);
    setThemeKeyState(safeKey);
  };

  const value = useMemo(() => ({ themeKey, setThemeKey, themeOptions: THEME_PRESETS }), [themeKey]);

  return (
    <ThemeConfigContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeConfigContext.Provider>
  );
}

AppThemeProvider.propTypes = { children: PropTypes.node.isRequired };

export const useThemeConfig = () => useContext(ThemeConfigContext);
