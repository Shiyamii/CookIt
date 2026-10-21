import { describe, expect, test } from 'bun:test';
import { MAX_RECIPE_MARKDOWN_LENGTH } from '@cookit/shared';
import { strToU8, zipSync } from 'fflate';
import {
  IMPORT_LIMITS,
  ImportFileError,
  markdownFileName,
  parseImport,
  readImportFile,
} from './importing';

const recipe = (title: string, extra = '') =>
  `# ${title}\n\nportions: 4\n${extra}\n---\n\n- 200 g de farine\n\n---\n\n1. Cuire 10 min.\n`;

const zipOf = (files: Record<string, string>, name = 'recipes.zip') => {
  const data = zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));
  return new File([data as BlobPart], name, { type: 'application/zip' });
};

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'ok';
  } catch (error) {
    return error instanceof ImportFileError ? error.code : 'unknown';
  }
}

describe('parseImport', () => {
  test('tag values of the tags line are split on commas and semicolons', () => {
    const result = parseImport(recipe('Tarte', 'tags: dessert, facile; Française\n'));
    expect(result.ok).toBe(true);
    expect(result.tagValues).toEqual(['dessert', 'facile', 'Française']);
  });

  test('a recipe without tags line has no tag values', () => {
    const result = parseImport(recipe('Tarte'));
    expect(result.ok && result.tagValues).toEqual([]);
  });

  test('an invalid document is not ok and has errors', () => {
    const result = parseImport('just some text');
    expect(result.ok).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.tagValues).toEqual([]);
  });

  test('a missing servings line is an error', () => {
    const result = parseImport('# Soupe\n\n---\n\n---\n');
    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((d) => d.code)).toContain('missing_servings');
  });
});

describe('markdownFileName', () => {
  test.each([
    ['Tarte aux pommes', 'tarte-aux-pommes.md'],
    ['Crème brûlée !', 'creme-brulee.md'],
    ['  --Œufs & Co--  ', 'ufs-co.md'],
    ['日本語', 'recette.md'],
    ['', 'recette.md'],
    ['../../etc/passwd', 'etc-passwd.md'],
  ])('%j gives %j', (title, expected) => {
    expect(markdownFileName(title)).toBe(expected);
  });

  test('is bounded and never contains a path separator', () => {
    const name = markdownFileName('a'.repeat(500));
    expect(name.length).toBeLessThanOrEqual(83);
    expect(markdownFileName('a/b\\c')).not.toMatch(/[/\\]/);
  });
});

describe('readImportFile: markdown', () => {
  test('reads a .md file', async () => {
    const file = new File([recipe('Tarte')], 'tarte.md');
    expect(await readImportFile(file)).toEqual([{ name: 'tarte.md', markdown: recipe('Tarte') }]);
  });
  test('accepts .markdown and .txt, refuses other extensions', async () => {
    expect(await code(readImportFile(new File(['x'], 'a.markdown')))).toBe('ok');
    expect(await code(readImportFile(new File(['x'], 'a.TXT')))).toBe('ok');
    expect(await code(readImportFile(new File(['x'], 'a.pdf')))).toBe('not_a_recipe_file');
    expect(await code(readImportFile(new File(['x'], 'a')))).toBe('not_a_recipe_file');
  });
  test('refuses a file over the size limit before reading it', async () => {
    const file = new File([new Uint8Array(IMPORT_LIMITS.markdownBytes + 1)], 'big.md');
    expect(await code(readImportFile(file))).toBe('file_too_large');
  });
});

describe('readImportFile: zip', () => {
  test('reads several recipes sorted by name, without folders', async () => {
    const sources = await readImportFile(
      zipOf({ 'b.md': recipe('B'), 'dir/a.md': recipe('A'), 'notes.pdf': 'x', 'c.txt': 'c' }),
    );
    expect(sources.map((s) => s.name)).toEqual(['a.md', 'b.md', 'c.txt']);
    expect(sources[0]?.markdown).toBe(recipe('A'));
  });
  test('ignores __MACOSX entries', async () => {
    const sources = await readImportFile(zipOf({ 'a.md': recipe('A'), '__MACOSX/._a.md': 'junk' }));
    expect(sources.map((s) => s.name)).toEqual(['a.md']);
  });
  test('a zip without recipe files is refused', async () => {
    expect(await code(readImportFile(zipOf({ 'a.pdf': 'x' })))).toBe('not_a_recipe_file');
    expect(await code(readImportFile(zipOf({})))).toBe('not_a_recipe_file');
  });
  test('a corrupted zip is unreadable', async () => {
    const file = new File([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])], 'x.zip');
    expect(await code(readImportFile(file))).toBe('unreadable_zip');
  });
  test('an entry over the per-entry limit refuses the zip', async () => {
    const big = 'x'.repeat(IMPORT_LIMITS.entryBytes + 1);
    expect(await code(readImportFile(zipOf({ 'a.md': recipe('A'), 'big.md': big })))).toBe(
      'zip_too_large',
    );
  });
  test('too many entries refuses the zip', async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i <= IMPORT_LIMITS.zipEntries; i++) files[`r${i}.md`] = 'x';
    expect(await code(readImportFile(zipOf(files)))).toBe('zip_too_large');
  });
  test('a zip file over the size limit is refused before being read', async () => {
    const file = new File([new Uint8Array(IMPORT_LIMITS.zipBytes + 1)], 'big.zip');
    expect(await code(readImportFile(file))).toBe('zip_too_large');
  });
  test('a recipe longer than the maximum document is left out', async () => {
    const long = 'x'.repeat(MAX_RECIPE_MARKDOWN_LENGTH + 1);
    const sources = await readImportFile(zipOf({ 'ok.md': recipe('Ok'), 'long.md': long }));
    expect(sources.map((s) => s.name)).toEqual(['ok.md']);
  });
  test('a zip is recognized by its type even with another name', async () => {
    const data = zipSync({ 'a.md': strToU8(recipe('A')) });
    const file = new File([data as BlobPart], 'export', { type: 'application/zip' });
    expect((await readImportFile(file)).map((s) => s.name)).toEqual(['a.md']);
  });
});
