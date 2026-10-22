import { describe, expect, test } from 'bun:test';
import { isImage, isOfflineApi } from './offline-api';

describe('API answers kept for offline use', () => {
  test('what opening and cooking a recipe needs', () => {
    for (const path of [
      '/api/v1/me',
      '/api/v1/units',
      '/api/v1/tags',
      '/api/v1/meta',
      '/api/v1/recipes',
      '/api/v1/recipes/idea',
      '/api/v1/gallery',
      '/api/v1/recipes/4f8ea449-3387-4b6d-b41c-f31a17963f7e',
    ]) {
      expect(isOfflineApi(path)).toBe(true);
    }
  });

  test('never the cooking session (its own local copy), push, admin or account security', () => {
    for (const path of [
      '/api/v1/cook/session',
      '/api/v1/push/key',
      '/api/v1/push/subscriptions',
      '/api/v1/admin/users',
      '/api/v1/me/security',
      '/api/v1/recipes/export',
      '/api/v1/recipes/4f8ea449-3387-4b6d-b41c-f31a17963f7e/translations/en',
      '/api/v1/auth/get-session',
      '/api/v1/mex',
    ]) {
      expect(isOfflineApi(path)).toBe(false);
    }
  });

  const id = '4f8ea449-3387-4b6d-b41c-f31a17963f7e';

  test('a pathname has no query string: one containing "?" is not a match', () => {
    expect(isOfflineApi('/api/v1/recipes?tags=a')).toBe(false);
    expect(isOfflineApi(`/api/v1/recipes/${id}?lang=en`)).toBe(false);
    expect(isOfflineApi(new URL('/api/v1/recipes?tags=a', 'https://x.test').pathname)).toBe(true);
  });

  test('exact paths only: no trailing slash, no other version, no prefix or suffix', () => {
    for (const path of [
      '/api/v1/recipes/',
      '/api/v1/me/',
      '/api/v2/recipes',
      '/api/recipes',
      '/api/v1/gallery/extra',
      '/x/api/v1/units',
      'api/v1/units',
      '/API/v1/units',
      '/api/v1/recipes//',
      '',
    ]) {
      expect(isOfflineApi(path)).toBe(false);
    }
  });

  test('recipe details: lowercase ids only, sub-routes and encoded paths are refused', () => {
    expect(isOfflineApi(`/api/v1/recipes/${id.toUpperCase()}`)).toBe(false);
    expect(isOfflineApi(`/api/v1/recipes/${id}/`)).toBe(false);
    expect(isOfflineApi(`/api/v1/recipes/${id}/translations/en`)).toBe(false);
    expect(isOfflineApi(`/api/v1/recipes/${id}/share`)).toBe(false);
    expect(isOfflineApi(`/api/v1/recipes/${id.slice(1)}`)).toBe(false);
    expect(isOfflineApi(`/api/v1/recipes/${id}0`)).toBe(false);
    expect(isOfflineApi('/api/v1/recipes/not-a-uuid')).toBe(false);
    expect(isOfflineApi('/api/v1/recipes/%34f8ea449-3387-4b6d-b41c-f31a17963f7e')).toBe(false);
    expect(isOfflineApi('/api/v1/recipes/..%2fcook%2fsession')).toBe(false);
    expect(isOfflineApi('/api/v1/recipes/../cook/session')).toBe(false);
  });
});

describe('pictures kept for offline use', () => {
  const id = '4f8ea449-3387-4b6d-b41c-f31a17963f7e';

  test('recipe photos, their thumbnails and profile pictures', () => {
    for (const path of [
      `/images/recipes/${id}`,
      `/images/recipes/${id}/thumb`,
      `/images/avatars/${id}`,
    ]) {
      expect(isImage(path)).toBe(true);
    }
  });

  test('nothing else', () => {
    for (const path of [
      '/images/recipes',
      `/images/recipes/${id}/other`,
      `/images/avatars/${id}/thumb`,
      `/api/v1/recipes/${id}/images`,
      `/images/x/${id}`,
      '/pwa-192x192.png',
    ]) {
      expect(isImage(path)).toBe(false);
    }
  });
});
