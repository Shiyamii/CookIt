// Tooling only (not shipped): shows what the parser reads from a recipe file.
// Usage: bun run parse <file.md> [--servings N] [--lang fr|en|hu] [--json | --canonical]
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import {
  isLocale,
  parseRecipe,
  scaleFactor,
  scaleIngredient,
  scaleSegment,
  serializeRecipe,
  type IngredientGroup,
  type StepGroup,
} from '../src';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    servings: { type: 'string' },
    lang: { type: 'string', default: 'fr' },
    json: { type: 'boolean', default: false },
    canonical: { type: 'boolean', default: false },
  },
});
const [file] = positionals;
const locale = values.lang;
if (!file || !isLocale(locale)) {
  console.error(
    'Usage: bun run parse <file.md> [--servings N] [--lang fr|en|hu] [--json | --canonical]',
  );
  process.exit(1);
}

const result = parseRecipe(readFileSync(file, 'utf8'));
if (values.json) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

for (const d of result.diagnostics) {
  const where = d.line ? ` (line ${d.line})` : '';
  const params = d.params ? ` ${JSON.stringify(d.params)}` : '';
  console.log(`${d.severity === 'error' ? 'ERROR' : 'warn '} ${d.code}${where}${params}`);
}
if (!result.ok) process.exit(1);

const doc = result.document;
if (values.canonical) {
  console.log(serializeRecipe(doc, { locale, includeTags: true }));
  process.exit(0);
}

const servings = values.servings ? Number(values.servings) : doc.servings;
const factor = scaleFactor(doc.servings, servings);
const scale = { locale };

console.log(`\n# ${doc.title}  (${servings} servings, recipe written for ${doc.servings})`);
if (doc.description) console.log(indent(doc.description, '  > '));
const meta = { source: doc.source, format: doc.format, tags: doc.tags.join(', ') || undefined };
for (const [key, value] of Object.entries({ ...meta, ...doc.extraMeta })) {
  if (value !== undefined) console.log(`  ${key}: ${value}`);
}

console.log('\nIngredients');
printGroups(doc.ingredientGroups, (item) => {
  if (item.kind !== 'ingredient') return '';
  const unit = item.unit ? ` [${item.unit.slug}]` : '';
  return `- ${scaleIngredient(item, factor, scale)}${unit}  → ${item.name}`;
});
console.log('\nSteps');
printGroups(doc.stepGroups, (item) => {
  if (item.kind !== 'step') return '';
  const text = item.segments
    .map((segment) =>
      segment.kind === 'timer'
        ? `⏱ ${segment.text} [${segment.seconds}s "${segment.label}"]`
        : segment.kind === 'quantity'
          ? `«${scaleSegment(segment, factor, scale)}»`
          : segment.text,
    )
    .join('');
  return `${item.index + 1}. ${text}`;
});

function printGroups(
  groups: (IngredientGroup | StepGroup)[],
  format: (item: (IngredientGroup | StepGroup)['items'][number]) => string,
) {
  for (const group of groups) {
    if (group.name !== undefined) console.log(`  ### ${group.name || '(empty heading)'}`);
    for (const item of group.items) {
      const text = item.kind === 'text' ? `[text] ${item.raw}` : format(item);
      console.log(`${indent(text, '    ')}   ← line ${item.line}`);
    }
  }
}

function indent(text: string, prefix: string) {
  return text
    .split('\n')
    .map((line) => prefix + line)
    .join('\n');
}
