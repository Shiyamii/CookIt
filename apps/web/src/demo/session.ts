// Who the demo visitor is: the demo member or the demo admin, switched from the demo banner.
// Kept in this browser only.

export type DemoRole = 'member' | 'admin';

const KEY = 'cookit-demo-role';

export const DEMO_USER_IDS: Record<DemoRole, string> = {
  admin: '00000000-0000-4000-8000-00000000a001',
  member: '00000000-0000-4000-8000-00000000a002',
};

export function demoRole(): DemoRole {
  try {
    return localStorage.getItem(KEY) === 'admin' ? 'admin' : 'member';
  } catch {
    return 'member';
  }
}

export function setDemoRole(role: DemoRole): void {
  try {
    localStorage.setItem(KEY, role);
  } catch {
    // Not remembered: the next visit starts as the member again.
  }
}
