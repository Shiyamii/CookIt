import { useQuery } from '@tanstack/react-query';
import { fetchMeta, type ApiStatus } from '../model/meta';

export function useHomeViewModel(): { apiStatus: ApiStatus } {
  const meta = useQuery({ queryKey: ['meta'], queryFn: fetchMeta });
  return { apiStatus: meta.isPending ? 'loading' : meta.isError ? 'error' : 'ok' };
}
