import { apiGet } from '@/lib/api';

export type Meta = {
  name: string;
  version: string;
  locales: string[];
  /** Email is configured: invites can be emailed, "forgot your password?" is offered. */
  email: boolean;
};

export const META_QUERY_KEY = ['meta'] as const;

export type ApiStatus = 'loading' | 'error' | 'ok';

export function fetchMeta(): Promise<Meta> {
  return apiGet<Meta>('/meta');
}
