import { useState } from 'react';
import { resetDemo } from '@/demo/server';
import { demoRole, setDemoRole, type DemoRole } from '@/demo/session';

/**
 * The demo banner (demo build only): who the visitor is (the demo member or the demo admin) and
 * starting the demo again. Both reload the page: every per-user store starts afresh.
 */
export function useDemoBannerViewModel() {
  const [confirmReset, setConfirmReset] = useState(false);
  return {
    role: demoRole(),
    roles: ['member', 'admin'] as const,
    chooseRole: (role: DemoRole) => {
      if (role === demoRole()) return;
      setDemoRole(role);
      window.location.reload();
    },
    confirmReset,
    askReset: () => setConfirmReset(true),
    cancelReset: () => setConfirmReset(false),
    reset: async () => {
      await resetDemo();
      try {
        // Local copies of the cooking session and the shopping list, per-device settings.
        localStorage.clear();
        sessionStorage.clear();
      } catch {
        // Nothing stored.
      }
      window.location.reload();
    },
  };
}
