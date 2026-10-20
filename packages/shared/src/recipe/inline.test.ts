import { describe, expect, test } from 'bun:test';
import { unitIndex } from '../units/index-units';
import { MAX_INLINE_LENGTH, MAX_TIMER_SECONDS, parseDuration, parseInline } from './inline';
import { parseRecipe } from './parse';

const units = unitIndex();

describe('parseDuration', () => {
  test.each([
    ['10m', 600],
    ['1h30m', 5400],
    ['45s', 45],
    ['1h', 3600],
    ['2m30s', 150],
    ['1h0m5s', 3605],
  ])('%p is %p seconds', (value, seconds) => {
    expect(parseDuration(value)).toBe(seconds);
  });

  test.each(['', '0m', '10', '10 min', '1m1h', '-5m', '200h', '1.5h'])('%p is invalid', (value) => {
    expect(parseDuration(value)).toBeUndefined();
  });
});

describe('parseInline', () => {
  test('splits a step into text, timers and quantities, keeping the text as written', () => {
    const raw =
      "Dorer les **lardons** [5 min](timer:5m 'lardons') avec [2 c. à soupe](q:) d'huile.";
    const { segments, issues } = parseInline(raw, units);
    expect(issues).toEqual([]);
    expect(segments).toEqual([
      { kind: 'text', text: 'Dorer les **lardons** ' },
      { kind: 'timer', text: '5 min', seconds: 300, label: 'lardons' },
      { kind: 'text', text: ' avec ' },
      {
        kind: 'quantity',
        text: '2 c. à soupe',
        quantity: { start: 0, end: 1, amount: { value: 2 } },
        unit: { start: 2, end: 12, slug: 'cuillere-a-soupe' },
      },
      { kind: 'text', text: " d'huile." },
    ]);
  });

  test('the timer label defaults to the link text; double quotes work too', () => {
    expect(parseInline('[10 min](timer:10m)', units).segments).toEqual([
      { kind: 'timer', text: '10 min', seconds: 600, label: '10 min' },
    ]);
    expect(parseInline('[1 h](timer:1h "repos")', units).segments[0]).toMatchObject({
      label: 'repos',
    });
  });

  test('links in code spans or escaped are plain text', () => {
    for (const raw of ['`[10 min](timer:10m)`', '\\[10 min](timer:10m)']) {
      expect(parseInline(raw, units).segments).toEqual([{ kind: 'text', text: raw }]);
    }
  });

  test('ordinary links stay text', () => {
    const raw = 'Voir [la vidéo](https://exemple.com).';
    expect(parseInline(raw, units).segments).toEqual([{ kind: 'text', text: raw }]);
  });

  test('an invalid timer or quantity stays text, with an issue', () => {
    const raw = 'Cuire [longtemps](timer:abc) avec [un peu](q:) de sel.';
    const { segments, issues } = parseInline(raw, units);
    expect(segments).toEqual([{ kind: 'text', text: raw }]);
    expect(issues).toEqual([
      { code: 'invalid_timer', value: '[longtemps](timer:abc)' },
      { code: 'invalid_quantity', value: '[un peu](q:)' },
    ]);
  });

  test('does not overflow the stack on deeply nested input', () => {
    const raw = `${'>'.repeat(50_000)} [1 min](timer:1m)`;
    expect(() => parseInline(raw, units)).not.toThrow();
  });
});

describe('parseInline edge cases', () => {
  test('reference links are not special links: text, without issue', () => {
    const raw = 'Cuire [10 min][t].';
    expect(parseInline(raw, units)).toEqual({
      segments: [{ kind: 'text', text: raw }],
      issues: [],
    });
  });

  test('a timer autolink is not a timer (autolinks are not parsed)', () => {
    const raw = 'Cuire <timer:10m>.';
    expect(parseInline(raw, units)).toEqual({
      segments: [{ kind: 'text', text: raw }],
      issues: [],
    });
  });

  test('images with a timer: URL stay text, without issue', () => {
    const raw = '![photo](timer:1m)';
    expect(parseInline(raw, units)).toEqual({
      segments: [{ kind: 'text', text: raw }],
      issues: [],
    });
  });

  test('emphasis is not parsed: markup in a q: link text makes an invalid quantity', () => {
    // Emphasis parsing is disabled (quadratic on hostile input); write `[2 tbsp](q:)`.
    expect(parseInline('[**2** *tbsp*](q:)', units).issues).toEqual([
      { code: 'invalid_quantity', value: '[**2** *tbsp*](q:)' },
    ]);
  });

  test.each([
    [`[x](timer:1m 'a "b"')`, 'a "b"'],
    [`[x](timer:1m "it's")`, "it's"],
    ['[x](timer:1m (repos))', 'repos'],
    ['[x](timer:1m "  ")', 'x'],
    ['[x](timer:1m "")', 'x'],
  ])('reads the timer label of %p', (raw, label) => {
    expect(parseInline(raw, units).segments).toEqual([
      { kind: 'timer', text: 'x', seconds: 60, label },
    ]);
  });

  test('an angle-bracket destination is accepted', () => {
    expect(parseInline('[x](<timer:1m>)', units).segments[0]).toMatchObject({ seconds: 60 });
  });

  test('a q: range with a unit', () => {
    expect(parseInline('[2 à 3 c. à soupe](q:)', units).segments).toEqual([
      {
        kind: 'quantity',
        text: '2 à 3 c. à soupe',
        quantity: { start: 0, end: 5, amount: { value: 2, max: 3 }, separator: ' à ' },
        unit: { start: 6, end: 16, slug: 'cuillere-a-soupe' },
      },
    ]);
  });

  test('a q: quantity without unit has no unit', () => {
    expect(parseInline('[2](q:)', units).segments).toEqual([
      { kind: 'quantity', text: '2', quantity: { start: 0, end: 1, amount: { value: 2 } } },
    ]);
  });

  test('a q: quantity keeps its unit even at the end of the link text', () => {
    expect(parseInline('[250 g](q:)', units).segments[0]).toMatchObject({ unit: { slug: 'g' } });
  });

  test('several timers in one step, in order', () => {
    const raw = '[1 min](timer:1m) et [2 min](timer:2m) puis [3 min](timer:3m)';
    const { segments, issues } = parseInline(raw, units);
    expect(issues).toEqual([]);
    expect(segments.map((segment) => segment.kind)).toEqual([
      'timer',
      'text',
      'timer',
      'text',
      'timer',
    ]);
    expect(segments.flatMap((s) => (s.kind === 'timer' ? [s.seconds] : []))).toEqual([
      60, 120, 180,
    ]);
  });

  test('adjacent links: a valid timer then an invalid quantity', () => {
    expect(parseInline('[x](timer:1m)[y](q:)', units)).toEqual({
      segments: [
        { kind: 'timer', text: 'x', seconds: 60, label: 'x' },
        { kind: 'text', text: '[y](q:)' },
      ],
      issues: [{ code: 'invalid_quantity', value: '[y](q:)' }],
    });
  });

  test.each(['[x](timer:168h)', '[x](timer:10080m)', '[x](timer:604800s)'])(
    'a timer of exactly MAX_TIMER_SECONDS is accepted (%p)',
    (raw) => {
      expect(parseInline(raw, units).segments[0]).toMatchObject({
        kind: 'timer',
        seconds: MAX_TIMER_SECONDS,
      });
    },
  );

  test.each(['[x](timer:168h1s)', '[x](timer:604801s)', '[x](timer:)'])(
    '%p is an invalid timer',
    (raw) => {
      expect(parseInline(raw, units)).toEqual({
        segments: [{ kind: 'text', text: raw }],
        issues: [{ code: 'invalid_timer', value: raw }],
      });
    },
  );

  test('scheme case is ignored: [2 g](Q:) and [1 min](TIMER:1m) work', () => {
    expect(parseInline('[2 g](Q:)', units).segments[0]).toMatchObject({ kind: 'quantity' });
    expect(parseInline('[1 min](TIMER:1m)', units).segments[0]).toMatchObject({
      kind: 'timer',
      seconds: 60,
    });
  });

  test('a mistyped q: link is reported, not silently ignored', () => {
    expect(parseInline('[2 g](q:abc)', units).issues).toEqual([
      { code: 'invalid_quantity', value: '[2 g](q:abc)' },
    ]);
  });

  test('an empty q: link text is an invalid quantity', () => {
    expect(parseInline('[ ](q:)', units).issues).toEqual([
      { code: 'invalid_quantity', value: '[ ](q:)' },
    ]);
  });

  test('text segments joined with the link sources give back the raw text', () => {
    const raw =
      'A **b** [1 min](timer:1m "x") c [2 g](q:) d `[e](q:)` [f](https://g) [h](timer:0m).';
    const { segments } = parseInline(raw, units);
    const sources = ['[1 min](timer:1m "x")', '[2 g](q:)'];
    let rebuilt = '';
    for (const segment of segments) {
      rebuilt += segment.kind === 'text' ? segment.text : (sources.shift() ?? '');
    }
    expect(rebuilt).toBe(raw);
  });
});

describe('parseInline: hostile input', () => {
  const budget = (run: () => unknown) => {
    const started = performance.now();
    run();
    return performance.now() - started;
  };

  test('emphasis runs, nested brackets and containers stay fast', () => {
    const long = MAX_INLINE_LENGTH - 20;
    const inputs = [
      'a* '.repeat(long / 3) + '[1 min](timer:1m)',
      '!['.repeat(long / 6) + '](x)'.repeat(long / 6),
      '- '.repeat(long / 2) + '[1 min](timer:1m)',
      '>'.repeat(long) + '[1 min](timer:1m)',
      '['.repeat(long) + '](q:)',
    ];
    for (const raw of inputs) expect(budget(() => parseInline(raw, units))).toBeLessThan(500);
  });

  test('a step longer than MAX_INLINE_LENGTH stays text, with a warning', () => {
    const raw = `${'a* '.repeat(30_000)}[1 min](timer:1m)`;
    const result = parseInline(raw, units);
    expect(result.segments).toEqual([{ kind: 'text', text: raw }]);
    expect(result.issues.map((issue) => issue.code)).toEqual(['step_too_long']);
  });

  test('a whole document of steps without links skips the markdown parser', () => {
    const markdown = `# T\n\nportions: 2\n\n---\n\n---\n\n${'1. a\n'.repeat(39_000)}`;
    expect(budget(() => parseRecipe(markdown))).toBeLessThan(2000);
  });
});
