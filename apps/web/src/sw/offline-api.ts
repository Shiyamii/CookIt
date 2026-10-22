/**
 * What the service worker keeps for offline use (plan §5.5): the API reads needed to open the
 * pages already visited and to cook a recipe already opened. Never the cooking session (it has
 * its own local copy and must not be mistaken for the server's state), push, admin or account
 * security answers. Shared by the service worker and the page (sign-out clears the cache).
 */

export const OFFLINE_API_CACHE = 'cookit-api';
/** Pictures already seen (recipe photos, profile pictures): a URL never changes its picture. */
export const OFFLINE_IMAGES_CACHE = 'cookit-images';
/** Message from the page: someone signed out or in, drop the account's kept answers. */
export const CLEAR_OFFLINE_DATA = 'cookit:clear-offline-data';

const OFFLINE_API = [
  /^\/api\/v1\/me$/,
  /^\/api\/v1\/meta$/,
  /^\/api\/v1\/units$/,
  /^\/api\/v1\/tags$/,
  /^\/api\/v1\/recipes$/,
  /^\/api\/v1\/recipes\/idea$/,
  /^\/api\/v1\/gallery$/,
  /^\/api\/v1\/recipes\/[0-9a-f-]{36}$/,
];

export function isOfflineApi(pathname: string): boolean {
  return OFFLINE_API.some((pattern) => pattern.test(pathname));
}

const IMAGE = /^\/images\/(?:recipes\/[0-9a-f-]{36}(?:\/thumb)?|avatars\/[0-9a-f-]{36})$/;

export function isImage(pathname: string): boolean {
  return IMAGE.test(pathname);
}
