import { describe, expect, test } from 'bun:test';
import type { Unit, UnitEntry } from '@cookit/shared';
import type { UnitsRepository } from './units.repository';
import { createUnitsService } from './units.service';

const unit = (slug: string, aliases: string[] = [slug], rounding: Unit['rounding'] = 'decimal') =>
  ({ slug, rounding, labels: { en: slug }, aliases: { en: aliases } }) satisfies Unit;

function fakeRepository(initial: Unit[] = []) {
  let rows: UnitEntry[] = initial.map((u, i) => ({ ...u, id: `id-${u.slug}`, position: i }));
  const state = { lists: 0, reorders: [] as string[][] };
  const repository: UnitsRepository = {
    async list() {
      state.lists++;
      return rows.map((r) => ({ ...r }));
    },
    async create(u) {
      if (rows.some((r) => r.slug === u.slug)) return 'slug_taken';
      rows.push({ ...u, position: rows.length });
      return 'ok';
    },
    async update(id, u) {
      const row = rows.find((r) => r.id === id);
      if (!row) return 'not_found';
      if (rows.some((r) => r.id !== id && r.slug === u.slug)) return 'slug_taken';
      Object.assign(row, u);
      return 'ok';
    },
    async delete(id) {
      const before = rows.length;
      rows = rows.filter((r) => r.id !== id);
      return rows.length < before;
    },
    async reorder(ids) {
      state.reorders.push(ids);
      rows = ids.map((id, position) => ({ ...rows.find((r) => r.id === id)!, position }));
    },
  };
  return { repository, state };
}

const setup = (initial: Unit[] = [unit('g', ['g', 'gr']), unit('kg')]) => {
  const fake = fakeRepository(initial);
  let n = 0;
  const service = createUnitsService({ repository: fake.repository, newId: () => `new-${++n}` });
  return { service, ...fake };
};

describe('units service catalog cache', () => {
  test('reads the repository once while nothing changes', async () => {
    const { service, state } = setup();
    await service.catalog();
    await service.catalog();
    await service.list();
    expect(state.lists).toBe(1);
  });

  test('catalog() is a NEW array after a create (the parser caches its index per array)', async () => {
    const { service } = setup();
    const before = await service.catalog();
    await service.create(unit('tbsp'));
    const after = await service.catalog();
    expect(after).not.toBe(before);
    expect(after.map((u) => u.slug)).toContain('tbsp');
    expect(before.map((u) => u.slug)).not.toContain('tbsp');
  });

  test('catalog() is a new array after update, reorder and delete', async () => {
    const { service } = setup();
    let previous = await service.catalog();
    await service.update('id-g', unit('g', ['g', 'gramme']));
    let next = await service.catalog();
    expect(next).not.toBe(previous);
    expect(next.find((u) => u.slug === 'g')?.aliases.en).toEqual(['g', 'gramme']);
    previous = next;
    await service.reorder(['id-kg', 'id-g']);
    next = await service.catalog();
    expect(next).not.toBe(previous);
    expect(next.map((u) => u.slug)).toEqual(['kg', 'g']);
    previous = next;
    await service.delete('id-g');
    next = await service.catalog();
    expect(next).not.toBe(previous);
    expect(next.map((u) => u.slug)).toEqual(['kg']);
  });

  test('a failed repository read is not cached', async () => {
    let fail = true;
    const service = createUnitsService({
      repository: {
        ...fakeRepository().repository,
        async list() {
          if (fail) throw new Error('db down');
          return [];
        },
      },
    });
    await expect(service.catalog()).rejects.toThrow('db down');
    fail = false;
    expect(await service.catalog()).toEqual([]);
  });
});

describe('units service writes', () => {
  test('create returns the stored entry with its id', async () => {
    const { service } = setup();
    expect(await service.create(unit('tbsp'))).toMatchObject({ id: 'new-1', slug: 'tbsp' });
  });

  test('create refuses a slug already used', async () => {
    const { service } = setup();
    expect(await service.create(unit('g', ['gg']))).toEqual({ error: 'slug_taken' });
  });

  test('create refuses an alias used by another unit, ignoring case, accents, dots and spaces', async () => {
    const { service } = setup([unit('tbsp', ['T.B.S.P', 'cuillère'])]);
    const result = await service.create(unit('other', ['Cuillere', 'unique']));
    expect(result).toMatchObject({ error: 'alias_conflict' });
    expect((await service.list()).map((u) => u.slug)).toEqual(['tbsp']);
  });

  test('update may keep the unit own aliases', async () => {
    const { service } = setup();
    expect(await service.update('id-g', unit('g', ['g', 'gr', 'gramme']))).toEqual({ ok: true });
  });

  test('update refuses an alias of another unit', async () => {
    const { service } = setup();
    const result = await service.update('id-g', unit('g', ['g', 'KG']));
    expect(result).toEqual({ error: 'alias_conflict', aliases: ['kg'] });
  });

  test('update of an unknown unit is not_found', async () => {
    const { service } = setup();
    expect(await service.update('nope', unit('x'))).toEqual({ error: 'not_found' });
  });

  test('update to a slug of another unit is slug_taken', async () => {
    const { service } = setup();
    expect(await service.update('id-g', unit('kg', ['gg']))).toEqual({ error: 'slug_taken' });
  });

  test('delete of an unknown unit is not_found', async () => {
    const { service } = setup();
    expect(await service.delete('nope')).toEqual({ error: 'not_found' });
  });
});

describe('units service reorder validation', () => {
  test.each([
    ['a missing unit', ['id-g']],
    ['a duplicate', ['id-g', 'id-g']],
    ['an unknown id', ['id-g', 'id-zzz']],
    ['too many ids', ['id-g', 'id-kg', 'id-kg']],
  ])('refuses %s without writing', async (_name, ids) => {
    const { service, state } = setup();
    expect(await service.reorder(ids)).toEqual({ error: 'not_found' });
    expect(state.reorders).toEqual([]);
  });
});
