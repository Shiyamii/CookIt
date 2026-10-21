// First import: configures Zod before any schema exists.
import './zod-config';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './i18n';
import './features/preferences/model/theme';
import { App } from './app/App';
import { registerServiceWorker } from './features/push/model/push';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

// Shows the timer notifications sent by the server (plan §5.4).
registerServiceWorker();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
