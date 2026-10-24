import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { errorCode } from '@/lib/api';
import { META_QUERY_KEY } from '@/features/system/model/meta';
import { fetchSettings, saveSettings, SETTINGS_QUERY_KEY } from '../model/admin';

/** The instance's settings (admin): whether public recipes are readable without an account. */
export function useSiteSettingsViewModel() {
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: SETTINGS_QUERY_KEY, queryFn: fetchSettings });
  // The choice shows at once, while it is saved (back to the saved one if it fails).
  const [chosen, setChosen] = useState<boolean>();
  const save = useMutation({
    mutationFn: saveSettings,
    onSuccess: async (saved) => {
      queryClient.setQueryData(SETTINGS_QUERY_KEY, saved);
      // The navigation and the home page read it from the meta.
      await queryClient.invalidateQueries({ queryKey: META_QUERY_KEY });
    },
    onSettled: () => setChosen(undefined),
  });

  return {
    loading: settings.isPending,
    loadError: settings.isError,
    publicGallery: chosen ?? settings.data?.publicGallery ?? false,
    saving: save.isPending,
    saved: save.isSuccess,
    error: save.isError ? errorCode(save.error) : undefined,
    setPublicGallery: (publicGallery: boolean) => {
      setChosen(publicGallery);
      save.mutate({ publicGallery });
    },
  };
}
