import { useSyncExternalStore } from 'react';
import { getTheme, setTheme, subscribeTheme, THEMES } from '../model/theme';

export function useThemeMenuViewModel() {
  return {
    theme: useSyncExternalStore(subscribeTheme, getTheme),
    themes: THEMES,
    selectTheme: (value: string) => {
      const next = THEMES.find((theme) => theme === value);
      if (next) setTheme(next);
    },
  };
}
