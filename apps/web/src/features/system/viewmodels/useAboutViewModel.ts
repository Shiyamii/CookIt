import { useQuery } from '@tanstack/react-query';
import { fetchMeta, META_QUERY_KEY } from '../model/meta';

/** Where the project lives: its source code and its published image. */
export const PROJECT_LINKS = {
  github: 'https://github.com/Shiyamii/CookIt',
  docker: 'https://hub.docker.com/r/shiyamii/cookit',
} as const;

/** The about page: what CookIt is, its version, where its code and image are. */
export function useAboutViewModel() {
  const meta = useQuery({ queryKey: META_QUERY_KEY, queryFn: fetchMeta });
  return {
    version: meta.data?.version,
    links: PROJECT_LINKS,
  };
}
