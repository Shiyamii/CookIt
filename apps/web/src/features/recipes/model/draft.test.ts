import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  clearDraft,
  clearDrafts,
  clearOtherUsersDrafts,
  draftKey,
  loadDraft,
  saveDraft,
} from './draft';

/** A tiny in-memory localStorage (Object.keys lists the stored keys, like the real one). */
function stubStorage(): Storage {
  const data: Record<string, string> = {};
  return new Proxy(data, {
    get(target, prop: string) {
      if (prop === 'getItem') return (k: string) => (k in target ? target[k] : null);
      if (prop === 'setItem') return (k: string, v: string) => void (target[k] = v);
      if (prop === 'removeItem') return (k: string) => void delete target[k];
      return target[prop];
    },
  }) as unknown as Storage;
}

const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: stubStorage(), configurable: true });
});
afterEach(() => {
  if (original) Object.defineProperty(globalThis, 'localStorage', original);
  else delete (globalThis as { localStorage?: unknown }).localStorage;
});

const draft = { markdown: '# T', savedAt: '2026-01-01T00:00:00.000Z' };

describe('drafts', () => {
  test('keys are per user and per recipe', () => {
    expect(draftKey('u1', undefined)).toBe('u1:new');
    expect(draftKey('u1', 'r1')).toBe('u1:r1');
  });
  test('save, load and clear', () => {
    saveDraft(draftKey('a', undefined), draft);
    expect(loadDraft(draftKey('a', undefined))).toEqual(draft);
    clearDraft(draftKey('a', undefined));
    expect(loadDraft(draftKey('a', undefined))).toBeUndefined();
  });
  test('another user does not get the draft', () => {
    saveDraft(draftKey('a', undefined), draft);
    expect(loadDraft(draftKey('b', undefined))).toBeUndefined();
  });
  test('clearOtherUsersDrafts keeps only the given user drafts', () => {
    saveDraft(draftKey('a', undefined), draft);
    saveDraft(draftKey('a', 'r'), draft);
    saveDraft(draftKey('b', undefined), draft);
    clearOtherUsersDrafts('a');
    expect(loadDraft(draftKey('a', undefined))).toEqual(draft);
    expect(loadDraft(draftKey('a', 'r'))).toEqual(draft);
    expect(loadDraft(draftKey('b', undefined))).toBeUndefined();
  });
  test('a user id that prefixes another is not confused', () => {
    saveDraft(draftKey('ab', undefined), draft);
    clearOtherUsersDrafts('a');
    expect(loadDraft(draftKey('ab', undefined))).toBeUndefined();
  });
  test('clearDrafts removes every draft but nothing else', () => {
    saveDraft(draftKey('a', undefined), draft);
    localStorage.setItem('other', 'x');
    clearDrafts();
    expect(loadDraft(draftKey('a', undefined))).toBeUndefined();
    expect(localStorage.getItem('other')).toBe('x');
  });
  test('corrupt or oversized drafts are ignored', () => {
    localStorage.setItem('cookit:draft:a:new', '{not json');
    expect(loadDraft('a:new')).toBeUndefined();
    localStorage.setItem('cookit:draft:a:new', '{"markdown":1}');
    expect(loadDraft('a:new')).toBeUndefined();
    saveDraft('a:big', { ...draft, markdown: 'x'.repeat(250_001) });
    expect(loadDraft('a:big')).toBeUndefined();
  });
  test('missing storage never throws', () => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
    expect(() => saveDraft('a:new', draft)).not.toThrow();
    expect(loadDraft('a:new')).toBeUndefined();
    expect(() => clearDrafts()).not.toThrow();
    expect(() => clearOtherUsersDrafts('a')).not.toThrow();
  });
});
