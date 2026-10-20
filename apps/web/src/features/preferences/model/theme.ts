export const THEMES = ['light', 'dark', 'system'] as const;
export type Theme = (typeof THEMES)[number];

const STORAGE_KEY = 'cookit.theme';
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set<() => void>();

function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return THEMES.find((theme) => theme === saved) ?? 'system';
  } catch {
    return 'system';
  }
}

let current = readTheme();

function apply() {
  const dark = current === 'dark' || (current === 'system' && darkQuery.matches);
  document.documentElement.classList.toggle('dark', dark);
}

export function setTheme(theme: Theme) {
  current = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage unavailable (private mode): the choice lasts for this page only.
  }
  apply();
  listeners.forEach((listener) => listener());
}

export function getTheme(): Theme {
  return current;
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

darkQuery.addEventListener('change', apply);
apply();
