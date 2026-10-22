import { apiDelete, apiPost, apiUpload } from '@/lib/api';
import { prepareAvatar } from '@/lib/images';

/** The display name, shown on the user's recipes and in the menu (the username never changes). */
export async function saveDisplayName(name: string): Promise<void> {
  await apiPost('/auth/update-user', { name: name.trim() });
}

/** Resized and cropped to a square in the browser, then sent. */
export async function uploadAvatar(file: Blob): Promise<{ image: string }> {
  const form = new FormData();
  form.append('image', await prepareAvatar(file));
  return apiUpload<{ image: string }>('PUT', '/me/avatar', form);
}

export async function removeAvatar(): Promise<void> {
  await apiDelete('/me/avatar');
}
