import { createContext, useContext, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { createAppTheme, THEME_PRESETS } from '../theme';

const STORAGE_KEY = 'mis_dashboard_theme_key';
const ThemeConfigContext = createContext({
  themeKey: 'whatsapp',
  setThemeKey: () => {},
  themeOptions: THEME_PRESETS,
});

export function AppThemeProvider({ children }) {
  const [themeKey, setThemeKeyState] = useState(() => localStorage.getItem(STORAGE_KEY) || 'whatsapp');
  const theme = useMemo(() => createAppTheme(themeKey), [themeKey]);

  const setThemeKey = (next) => {
    const safeKey = THEME_PRESETS[next] ? next : 'whatsapp';
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
