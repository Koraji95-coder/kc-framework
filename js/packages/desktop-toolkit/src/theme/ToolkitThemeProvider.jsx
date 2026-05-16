import { useEffect, useMemo, useState } from 'react';
import {
  applyToolkitThemeVariables,
  loadToolkitThemeState,
  resolveToolkitTheme,
  saveToolkitThemeState,
} from './themeSystem.js';

export function useToolkitThemeState({ storageKey } = {}) {
  const [themeState, setThemeState] = useState(() => loadToolkitThemeState(storageKey));
  const theme = useMemo(() => resolveToolkitTheme(themeState), [themeState]);

  useEffect(() => {
    applyToolkitThemeVariables(theme);
    saveToolkitThemeState(themeState, storageKey);
  }, [theme, themeState, storageKey]);

  return {
    theme,
    themeState,
    setThemeState,
  };
}

export function ToolkitThemeProvider({ storageKey, children }) {
  useToolkitThemeState({ storageKey });
  return children;
}

export default ToolkitThemeProvider;
