import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { errorCode } from '@/lib/api';
import { META_QUERY_KEY } from '@/features/system/model/meta';
import { fetchSettings, saveSettings, SETTINGS_QUERY_KEY } from '../model/admin';

/** The instance's settings (admin): whether public recipes are readable without an account. */
export function useSiteSettingsViewModel() {
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: SETTINGS_QUERY_KEY, queryFn: fetchSettings });
  const save = useMutation({
    mutationFn: saveSettings,
    onSuccess: async (saved) => {
      queryClient.setQueryData(SETTINGS_QUERY_KEY, saved);
      // The navigation and the home page read it from the meta.
      await queryClient.invalidateQueries({ queryKey: META_QUERY_KEY });
    },
  });

  return {
    loading: settings.isPending,
    loadError: settings.isError,
    publicGallery: save.isPending
      ? save.variables.publicGallery
      : (settings.data?.publicGallery ?? false),
    saving: save.isPending,
    saved: save.isSuccess,
    error: save.isError ? errorCode(save.error) : undefined,
    setPublicGallery: (publicGallery: boolean) => save.mutate({ publicGallery }),
  };
}
