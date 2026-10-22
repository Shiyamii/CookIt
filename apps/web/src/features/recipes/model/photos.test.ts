import { describe, expect, test } from 'bun:test';
import { filesThatFit, makeCover, moveImage } from './photos';

describe('photo order', () => {
  const ids = ['a', 'b', 'c'];

  test('moves a photo one place', () => {
    expect(moveImage(ids, 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveImage(ids, 'b', 1)).toEqual(['a', 'c', 'b']);
  });

  test('stays put at either end or for an unknown photo', () => {
    expect(moveImage(ids, 'a', -1)).toEqual(ids);
    expect(moveImage(ids, 'c', 1)).toEqual(ids);
    expect(moveImage(ids, 'x', 1)).toEqual(ids);
  });

  test('makes a photo the cover, the others keep their order', () => {
    expect(makeCover(ids, 'c')).toEqual(['c', 'a', 'b']);
    expect(makeCover(ids, 'a')).toEqual(ids);
    expect(makeCover(ids, 'x')).toEqual(ids);
  });

  test('never changes the given list', () => {
    const frozen = Object.freeze([...ids]);
    moveImage(frozen, 'a', 1);
    makeCover(frozen, 'c');
    expect(frozen).toEqual(ids);
  });
});

describe('filesThatFit', () => {
  test('keeps what fits in the six places', () => {
    expect(filesThatFit([1, 2, 3], 0)).toEqual({ files: [1, 2, 3], left: 0 });
    expect(filesThatFit([1, 2, 3], 4)).toEqual({ files: [1, 2], left: 1 });
    expect(filesThatFit([1, 2], 6)).toEqual({ files: [], left: 2 });
    expect(filesThatFit([1], 9)).toEqual({ files: [], left: 1 });
  });
});
