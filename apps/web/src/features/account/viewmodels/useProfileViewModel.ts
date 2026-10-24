import { updateProfileInputSchema } from '@cookit/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { errorCode } from '@/lib/api';
import { ImageError } from '@/lib/images';
import { SESSION_QUERY_KEY } from '@/features/auth/model/auth';
import { useSession } from '@/features/auth/viewmodels/useSession';
import { fetchListed, MEMBERS_QUERY_KEY, saveListed } from '@/features/members/model/members';
import { RECIPES_QUERY_KEY } from '@/features/recipes/model/recipes';
import { removeAvatar, saveDisplayName, uploadAvatar } from '../model/profile';

const failure = (error: unknown) => (error instanceof ImageError ? error.code : errorCode(error));

/** Profile page: display name, profile picture, and whether to appear in the members list. */
export function useProfileViewModel() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  // The name typed, once the user started editing it (the saved one until then).
  const [typed, setTyped] = useState<string>();
  const [invalidName, setInvalidName] = useState(false);
  const name = typed ?? user?.name ?? '';

  // The name and picture also appear on recipes (author): lists and details are read again.
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: RECIPES_QUERY_KEY }),
    ]);

  const nameMutation = useMutation({
    mutationFn: () => saveDisplayName(name),
    onSuccess: async () => {
      await refresh();
      setTyped(undefined);
    },
  });
  const upload = useMutation({ mutationFn: uploadAvatar, onSuccess: refresh });

  const LISTED_KEY = [...MEMBERS_QUERY_KEY, 'me', 'listed'];
  const listed = useQuery({ queryKey: LISTED_KEY, queryFn: fetchListed });
  const listing = useMutation({
    mutationFn: saveListed,
    onSuccess: async (saved) => {
      queryClient.setQueryData(LISTED_KEY, saved);
      await queryClient.invalidateQueries({ queryKey: MEMBERS_QUERY_KEY });
    },
  });
  const removal = useMutation({ mutationFn: removeAvatar, onSuccess: refresh });

  const pictureError = upload.isError
    ? failure(upload.error)
    : removal.isError
      ? failure(removal.error)
      : undefined;

  return {
    username: user?.username ?? '',
    image: user?.image ?? null,
    name,
    setName: (value: string) => {
      setTyped(value);
      setInvalidName(false);
      nameMutation.reset();
    },
    invalidName,
    nameSaved: nameMutation.isSuccess,
    nameError: nameMutation.isError ? errorCode(nameMutation.error) : undefined,
    savingName: nameMutation.isPending,
    saveName: (event: FormEvent) => {
      event.preventDefault();
      if (!updateProfileInputSchema.shape.name.safeParse(name).success) {
        setInvalidName(true);
        return;
      }
      nameMutation.mutate();
    },
    /** Appears in the members list (null while loading). */
    listed: listing.isPending ? listing.variables : (listed.data?.listed ?? null),
    listedSaving: listing.isPending,
    listedError: listing.isError ? errorCode(listing.error) : undefined,
    setListed: (value: boolean) => listing.mutate(value),
    pictureBusy: upload.isPending || removal.isPending,
    pictureError,
    choosePicture: (file: File | undefined) => {
      removal.reset();
      if (file) upload.mutate(file);
    },
    removePicture: () => {
      upload.reset();
      removal.mutate();
    },
  };
}
