import type {
  CreatedInvite,
  CreateInviteInput,
  InstanceSettings,
  InviteSummary,
  UserSummary,
} from '@cookit/shared';
import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api';

export const INVITES_QUERY_KEY = ['admin', 'invites'] as const;
export const USERS_QUERY_KEY = ['admin', 'users'] as const;
export const SETTINGS_QUERY_KEY = ['admin', 'settings'] as const;

/** The instance's settings (admin). */
export const fetchSettings = () => apiGet<InstanceSettings>('/admin/settings');

export const saveSettings = (settings: InstanceSettings) =>
  apiPut<InstanceSettings>('/admin/settings', settings);

export const listInvites = () => apiGet<InviteSummary[]>('/admin/invites');

export const createInvite = (input: CreateInviteInput) =>
  apiPost<CreatedInvite>('/admin/invites', input);

/** A test email to the signed-in admin's address. */
export const sendTestEmail = () => apiPost<{ ok: true; to: string }>('/admin/email/test');

export const revokeInvite = (id: string) =>
  apiPost(`/admin/invites/${encodeURIComponent(id)}/revoke`);

export const listUsers = () => apiGet<UserSummary[]>('/admin/users');

export const disableUser = (id: string) =>
  apiPost(`/admin/users/${encodeURIComponent(id)}/disable`);

export const enableUser = (id: string) => apiPost(`/admin/users/${encodeURIComponent(id)}/enable`);

/** Puts a user in the members list or takes them out (they can change it too). */
export const setUserListed = (id: string, listed: boolean) =>
  apiPut<{ listed: boolean }>(`/admin/users/${encodeURIComponent(id)}/listed`, { listed });

export const deleteUser = (id: string) => apiDelete(`/admin/users/${encodeURIComponent(id)}`);

export const createResetLink = (id: string) =>
  apiPost<{ url: string }>(`/admin/users/${encodeURIComponent(id)}/reset-link`);

/** Copies a link; false when the browser refuses (no permission, insecure context). */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
