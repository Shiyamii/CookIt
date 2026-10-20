import { apiGet } from '@/lib/api';

export type Meta = { name: string; version: string; locales: string[] };

export type ApiStatus = 'loading' | 'error' | 'ok';

export function fetchMeta(): Promise<Meta> {
  return apiGet<Meta>('/meta');
}
