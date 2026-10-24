import type { Locale, MemberProfile, MemberSummary, RecipePage } from '@cookit/shared';
import { apiGet, apiPut } from '@/lib/api';

export const MEMBERS_QUERY_KEY = ['members'] as const;

/** The members who chose to appear in the list. */
export function fetchMembers(): Promise<MemberSummary[]> {
  return apiGet<MemberSummary[]>('/members');
}

/** A member's page (listed or not), from their username. */
export function fetchMember(username: string): Promise<MemberProfile> {
  return apiGet<MemberProfile>(`/members/${encodeURIComponent(username)}`);
}

/** A member's public recipes, shown in `lang` when they have that translation. */
export function fetchMemberRecipes(
  username: string,
  page: number,
  lang?: Locale,
): Promise<RecipePage> {
  const params = new URLSearchParams();
  if (lang) params.set('lang', lang);
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return apiGet<RecipePage>(
    `/members/${encodeURIComponent(username)}/recipes${query ? `?${query}` : ''}`,
  );
}

/** Whether the signed-in user appears in the members list. */
export function fetchListed(): Promise<{ listed: boolean }> {
  return apiGet<{ listed: boolean }>('/me/listed');
}

export function saveListed(listed: boolean): Promise<{ listed: boolean }> {
  return apiPut<{ listed: boolean }>('/me/listed', { listed });
}
