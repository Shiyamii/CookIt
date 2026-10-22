// First import: configures Zod before any schema exists.
import './zod-config';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './i18n';
import './features/preferences/model/theme';
import { App } from './app/App';
import { registerServiceWorker } from './features/pwa/model/offline';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

// Offline use and timer notifications (plan §5.4, §5.5).
registerServiceWorker();

// A new version was deployed while this page was open: its lazily loaded pages are gone from
// the server. Reload once to get the new version instead of failing.
window.addEventListener('vite:preloadError', (event) => {
  const key = 'cookit.reloadedAt';
  try {
    if (Date.now() - Number(sessionStorage.getItem(key) ?? 0) < 10_000) return;
    sessionStorage.setItem(key, String(Date.now()));
  } catch {
    return;
  }
  event.preventDefault();
  window.location.reload();
});

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
