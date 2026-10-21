import { describe, expect, test } from 'bun:test';
import { unitIndex } from '../units/index-units';
import { parseInline } from './inline';
import { formatDuration, quantityLink, stepFromSegments, timerLink } from './links';

const units = unitIndex();

describe('formatDuration', () => {
  test('writes hours, minutes and seconds', () => {
    expect(formatDuration(5400)).toBe('1h30m');
    expect(formatDuration(600)).toBe('10m');
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(3661)).toBe('1h1m1s');
  });
});

describe('timerLink', () => {
  test('is read back as the same timer', () => {
    const link = timerLink('10 min', 600, 'Pâtes');
    expect(link).toBe('[10 min](timer:10m "Pâtes")');
    expect(parseInline(`Cuire ${link}.`, units).segments[1]).toEqual({
      kind: 'timer',
      text: '10 min',
      seconds: 600,
      label: 'Pâtes',
    });
  });

  test('escapes brackets and quotes, and omits a label equal to the text', () => {
    expect(timerLink('5 min', 300, '5 min')).toBe('[5 min](timer:5m)');
    const link = timerLink('a [b]', 60, 'say "hi"');
    const segment = parseInline(link, units).segments[0];
    expect(segment).toMatchObject({ kind: 'timer', text: 'a [b]', label: 'say "hi"', seconds: 60 });
  });
});

describe('quantityLink and stepFromSegments', () => {
  test('rebuild a step that parses to the same segments', () => {
    const raw = `Ajouter ${quantityLink('2 c. à soupe')} d'huile et cuire ${timerLink('1 h 30', 5400, 'Four')}.`;
    const { segments } = parseInline(raw, units);
    expect(segments.map((s) => s.kind)).toEqual(['text', 'quantity', 'text', 'timer', 'text']);
    expect(parseInline(stepFromSegments(segments), units).segments).toEqual(segments);
  });
});
