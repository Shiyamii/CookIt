import { apiGet } from '@/lib/api';

export type Meta = {
  name: string;
  version: string;
  locales: string[];
  /** Email is configured: invites can be emailed, "forgot your password?" is offered. */
  email: boolean;
  /** Public recipes and the gallery are readable without an account (else members only). */
  publicGallery: boolean;
};

export const META_QUERY_KEY = ['meta'] as const;

export type ApiStatus = 'loading' | 'error' | 'ok';

export function fetchMeta(): Promise<Meta> {
  return apiGet<Meta>('/meta');
}
