import type { Locale } from '../locale';
import { META_KEYS, CURRENT_FORMAT } from '../recipe/meta-keys';
import { parseRecipe } from '../recipe/parse';
import { serializeRecipe } from '../recipe/serialize';
import { MAX_RECIPE_MARKDOWN_LENGTH } from '../recipe/split';
import { labelFor, type TagCategory } from '../tags';
import { DEFAULT_UNITS } from '../units/catalog';
import type { Unit } from '../units/unit';
import { EXAMPLE_RECIPES } from './examples';

/**
 * Prompts for an external AI (plan §5.2 and §5.6): the user copies one into the assistant of
 * their choice and pastes the answer back, which goes through the normal preview. They are built
 * here from the format itself (keys, units, tags, an example in canonical form), never written by
 * hand in the interface, so they cannot drift from the parser.
 */

const MAX_PROMPT_UNITS = 100;
const MAX_PROMPT_TAGS = 300;

/** Language names, in the language of the prompt. */
const LANGUAGE_NAMES: Record<Locale, Record<Locale, string>> = {
  fr: { fr: 'français', en: 'anglais', hu: 'hongrois' },
  en: { fr: 'French', en: 'English', hu: 'Hungarian' },
  hu: { fr: 'francia', en: 'angol', hu: 'magyar' },
};

/** A code block that no backtick run of `text` can close. */
function fence(text: string, info = 'markdown'): string {
  // A loop, not `Math.max(...runs)`: a hostile recipe can have more runs than a call takes
  // arguments.
  let longest = 2;
  for (const run of text.match(/`+/g) ?? []) longest = Math.max(longest, run.length);
  const marks = '`'.repeat(longest + 1);
  return `${marks}${info}\n${text.trimEnd()}\n${marks}`;
}

/**
 * The example recipe in `lang`, in canonical form (current `format:` line), with `tags` (slugs)
 * when given. Parsed with the default units: it does not depend on the admin's catalog.
 */
export function promptExample(lang: Locale, tags: readonly string[] = []): string {
  const result = parseRecipe(EXAMPLE_RECIPES[lang], { units: DEFAULT_UNITS });
  if (!result.ok) throw new Error('The prompt example does not parse');
  return serializeRecipe(
    { ...result.document, tags: [...tags], format: CURRENT_FORMAT },
    { locale: lang, includeTags: true },
  );
}

/** How units are written in `lang` (first alias of each unit), as the AI should write them. */
function unitList(units: readonly Unit[], lang: Locale): string {
  const names = units
    .map((unit) => unit.aliases[lang]?.[0] ?? Object.values(unit.aliases).flat()[0])
    .filter((name): name is string => Boolean(name));
  return [...new Set(names)].slice(0, MAX_PROMPT_UNITS).join(', ');
}

/** Tag slugs with their names, by category (only the ones the AI may use). */
function tagLines(categories: readonly TagCategory[], locale: Locale): string[] {
  const text = TEXTS[locale];
  let count = 0;
  const lines: string[] = [];
  for (const category of categories) {
    const tags = category.tags.slice(0, Math.max(0, MAX_PROMPT_TAGS - count));
    if (tags.length === 0) continue;
    count += tags.length;
    const name = labelFor(category.labels, locale, category.slug);
    const choice = category.multiple ? text.several : text.single;
    const list = tags
      .map((tag) => `${tag.slug} (${labelFor(tag.labels, locale, tag.slug)})`)
      .join(', ');
    lines.push(`- ${name} (${choice})${text.colon} ${list}`);
  }
  return lines;
}

/** Tags that suit the example (crêpes), when the list has them. */
const EXAMPLE_TAGS = ['dessert', 'vegetarien', 'vegetarian'];

/**
 * Tags for the example: the ones that suit it, otherwise the first tag of the first category
 * (never two of a single-choice category).
 */
function exampleTags(categories: readonly TagCategory[]): string[] {
  const suited = categories.flatMap(
    (category) => category.tags.find((tag) => EXAMPLE_TAGS.includes(tag.slug))?.slug ?? [],
  );
  if (suited.length) return suited.slice(0, 2);
  const first = categories.find((category) => category.tags.length > 0)?.tags[0];
  return first ? [first.slug] : [];
}

type Texts = {
  /** `:` with the spacing of the language. */
  colon: string;
  single: string;
  several: string;
  importPrompt: (input: {
    lang: string;
    keys: { servings: string; tags: string };
    units: string;
    tags: string[];
    example: string;
  }) => string[];
  translationPrompt: (input: { from: string; to: string; recipe: string }) => string[];
};

const TEXTS: Record<Locale, Texts> = {
  fr: {
    colon: ' :',
    single: 'un seul',
    several: 'plusieurs possibles',
    importPrompt: ({ lang, keys, units, tags, example }) => [
      "Tu convertis une recette dans le format de recette de CookIt, une application de cuisine. La recette à convertir est à la fin de ce message (texte copié d'un site ou d'un document, ou photo).",
      '',
      '## Le format',
      '',
      'Un document markdown en trois parties, séparées par une ligne `---` seule, avec une ligne vide avant et après :',
      '',
      `1. **Présentation** : \`# Titre\` (obligatoire), la description éventuelle en citation (\`> …\`), puis des lignes \`clé: valeur\` : \`${keys.servings}: N\` (nombre de portions, entier), \`source: …\` (adresse de la recette si elle est connue)${tags.length ? `, \`${keys.tags}: …\` (voir plus bas)` : ''} et \`format: ${CURRENT_FORMAT}\`.`,
      "2. **Ingrédients** : une ligne `- ` par ingrédient, dans l'ordre quantité, unité, nom (`- 250 g de farine`, `- 2 à 3 c. à soupe de sucre`, `- 3 œufs`, `- sel`). Quantités : entiers, décimaux, fractions (`1/2`, `½`, `1 ½`) ou plages (`2-3`, `2 à 3`).",
      '3. **Étapes** : une étape par ligne, numérotée (`1. …`).',
      '',
      'Dans les parties 2 et 3, un titre `### Nom du groupe` regroupe les lignes qui le suivent (par exemple `### Pâte`, `### Garniture`), seulement si la recette a des groupes.',
      '',
      'Dans le texte des étapes :',
      '',
      '- **minuteur** : `[10 min](timer:10m "nom du minuteur")`. La durée s\'écrit en heures, minutes et secondes : `45s`, `10m`, `1h30m`. Le nom entre guillemets est facultatif.',
      "- **quantité qui suit le nombre de portions** : `[20 g](q:)`, quand une étape cite une quantité d'ingrédient.",
      '',
      `Unités reconnues : ${units}.`,
      ...(tags.length
        ? [
            '',
            `Tags : la ligne \`${keys.tags}:\` ne contient que des identifiants de cette liste, séparés par des virgules. N'en invente aucun ; si aucun ne convient, omets la ligne.`,
            '',
            ...tags,
          ]
        : []),
      '',
      '## Exemple complet',
      '',
      example,
      '',
      '## Consignes',
      '',
      "- N'invente rien : ni ingrédient, ni quantité, ni étape, ni nombre de portions. Ne devine jamais une quantité : si elle manque, écris l'ingrédient sans quantité.",
      `- Si le nombre de portions n'est pas indiqué, omets la ligne \`${keys.servings}:\` : l'application me demandera de la compléter. Signale en une phrase, à la fin de la description, ce qui manque ou ce qui n'était pas clair.`,
      "- Conserve toutes les durées. Crée un minuteur pour chaque temps de cuisson, de repos ou d'attente cité dans une étape.",
      `- Écris la recette en ${lang}. Ne convertis pas les unités.`,
      '- Réponds uniquement avec un bloc de code markdown contenant la recette, sans texte avant ni après.',
      '',
      '## Recette à convertir',
      '',
    ],
    translationPrompt: ({ from, to, recipe }) => [
      `Tu traduis une recette de CookIt, une application de cuisine. Langue de départ : ${from}. Langue d'arrivée : ${to}.`,
      '',
      '## Consignes',
      '',
      "- Conserve exactement la structure : les trois parties séparées par une ligne `---`, les mêmes groupes `###` dans le même ordre, le même nombre d'ingrédients et d'étapes dans chaque groupe.",
      "- Traduis le titre, la description, les noms des groupes, les ingrédients, les étapes et les noms des minuteurs (le texte entre guillemets d'un lien `timer:`).",
      '- Garde les liens `timer:` et `q:` tels quels : même syntaxe, même durée (`timer:10m`) ; seul le texte entre crochets et le nom du minuteur se traduisent.',
      "- Ne convertis ni les unités ni les quantités (250 g reste 250 g) ; seul le nom de l'unité se traduit.",
      '- Garde les lignes `clé: valeur` de la présentation (portions, source, format) avec les mêmes valeurs.',
      '- Réponds uniquement avec un bloc de code markdown contenant la recette traduite, sans texte avant ni après.',
      '',
      '## Recette',
      '',
      recipe,
    ],
  },
  en: {
    colon: ':',
    single: 'only one',
    several: 'several allowed',
    importPrompt: ({ lang, keys, units, tags, example }) => [
      'You convert a recipe into the recipe format of CookIt, a cooking app. The recipe to convert is at the end of this message (text copied from a website or a document, or a photo).',
      '',
      '## The format',
      '',
      'A markdown document in three parts, separated by a line containing only `---`, with a blank line before and after:',
      '',
      `1. **Presentation**: \`# Title\` (required), the description if any as a quote (\`> …\`), then \`key: value\` lines: \`${keys.servings}: N\` (number of servings, an integer), \`source: …\` (the recipe's address when known)${tags.length ? `, \`${keys.tags}: …\` (see below)` : ''} and \`format: ${CURRENT_FORMAT}\`.`,
      '2. **Ingredients**: one `- ` line per ingredient, as quantity, unit, name (`- 250 g flour`, `- 2-3 tbsp sugar`, `- 3 eggs`, `- salt`). Quantities: integers, decimals, fractions (`1/2`, `½`, `1 ½`) or ranges (`2-3`).',
      '3. **Steps**: one step per line, numbered (`1. …`).',
      '',
      'In parts 2 and 3, a `### Group name` heading groups the lines after it (for example `### Batter`, `### Topping`), only when the recipe has groups.',
      '',
      'In the text of the steps:',
      '',
      '- **timer**: `[10 min](timer:10m "timer name")`. The duration is written in hours, minutes and seconds: `45s`, `10m`, `1h30m`. The quoted name is optional.',
      '- **quantity that follows the number of servings**: `[20 g](q:)`, when a step mentions an ingredient quantity.',
      '',
      `Recognized units: ${units}.`,
      ...(tags.length
        ? [
            '',
            `Tags: the \`${keys.tags}:\` line only contains ids from this list, separated by commas. Never make one up; if none fits, leave the line out.`,
            '',
            ...tags,
          ]
        : []),
      '',
      '## Complete example',
      '',
      example,
      '',
      '## Rules',
      '',
      '- Make nothing up: no ingredient, quantity, step or number of servings. Never guess a quantity: when it is missing, write the ingredient without a quantity.',
      `- When the number of servings is not given, leave out the \`${keys.servings}:\` line: the app will ask me for it. Say in one sentence, at the end of the description, what is missing or was unclear.`,
      '- Keep every duration. Create a timer for each cooking, resting or waiting time mentioned in a step.',
      `- Write the recipe in ${lang}. Do not convert units.`,
      '- Answer only with a markdown code block containing the recipe, with no text before or after it.',
      '',
      '## Recipe to convert',
      '',
    ],
    translationPrompt: ({ from, to, recipe }) => [
      `You translate a recipe of CookIt, a cooking app. From: ${from}. To: ${to}.`,
      '',
      '## Rules',
      '',
      '- Keep exactly the same structure: the three parts separated by a `---` line, the same `###` groups in the same order, the same number of ingredients and steps in each group.',
      '- Translate the title, the description, the group names, the ingredients, the steps and the timer names (the quoted text of a `timer:` link).',
      '- Keep the `timer:` and `q:` links as they are: same syntax, same duration (`timer:10m`); only the text in brackets and the timer name are translated.',
      '- Convert neither units nor quantities (250 g stays 250 g); only the name of the unit is translated.',
      '- Keep the `key: value` lines of the presentation (servings, source, format) with the same values.',
      '- Answer only with a markdown code block containing the translated recipe, with no text before or after it.',
      '',
      '## Recipe',
      '',
      recipe,
    ],
  },
  hu: {
    colon: ':',
    single: 'csak egy',
    several: 'több is lehet',
    importPrompt: ({ lang, keys, units, tags, example }) => [
      'Egy receptet alakítasz át a CookIt (főzős alkalmazás) receptformátumára. Az átalakítandó recept az üzenet végén található (weboldalról vagy dokumentumból másolt szöveg, vagy fénykép).',
      '',
      '## A formátum',
      '',
      'Háromrészes markdown dokumentum; a részeket egy önálló `---` sor választja el, előtte és utána egy üres sorral:',
      '',
      `1. **Bemutatás**: \`# Cím\` (kötelező), az esetleges leírás idézetként (\`> …\`), majd \`kulcs: érték\` sorok: \`${keys.servings}: N\` (adagok száma, egész szám), \`source: …\` (a recept címe, ha ismert)${tags.length ? `, \`${keys.tags}: …\` (lásd lent)` : ''} és \`format: ${CURRENT_FORMAT}\`.`,
      '2. **Hozzávalók**: hozzávalónként egy `- ` sor, ebben a sorrendben: mennyiség, mértékegység, név (`- 25 dkg liszt`, `- 2-3 ek cukor`, `- 3 tojás`, `- só`). Mennyiségek: egész számok, tizedes törtek, törtek (`1/2`, `½`, `1 ½`) vagy tartományok (`2-3`).',
      '3. **Elkészítés**: soronként egy lépés, számozva (`1. …`).',
      '',
      'A 2. és 3. részben egy `### Csoport neve` cím csoportosítja az utána következő sorokat (például `### Tészta`, `### Töltelék`), csak ha a receptben vannak csoportok.',
      '',
      'A lépések szövegében:',
      '',
      '- **időzítő**: `[10 perc](timer:10m "az időzítő neve")`. Az időtartam órában, percben és másodpercben: `45s`, `10m`, `1h30m`. Az idézőjeles név elhagyható.',
      '- **az adagok számát követő mennyiség**: `[20 g](q:)`, ha egy lépés egy hozzávaló mennyiségét említi.',
      '',
      `Ismert mértékegységek: ${units}.`,
      ...(tags.length
        ? [
            '',
            `Címkék: a \`${keys.tags}:\` sor csak az alábbi lista azonosítóit tartalmazza, vesszővel elválasztva. Ne találj ki újat; ha egyik sem illik, hagyd ki a sort.`,
            '',
            ...tags,
          ]
        : []),
      '',
      '## Teljes példa',
      '',
      example,
      '',
      '## Szabályok',
      '',
      '- Ne találj ki semmit: se hozzávalót, se mennyiséget, se lépést, se adagszámot. Soha ne becsülj meg mennyiséget: ha hiányzik, írd a hozzávalót mennyiség nélkül.',
      `- Ha az adagok száma nincs megadva, hagyd ki a \`${keys.servings}:\` sort: az alkalmazás meg fogja kérdezni tőlem. A leírás végén egy mondatban jelezd, mi hiányzik vagy mi nem volt egyértelmű.`,
      '- Tarts meg minden időtartamot. Készíts időzítőt minden sütési, főzési, pihentetési vagy várakozási időhöz, amelyet egy lépés említ.',
      `- A receptet ${lang} nyelven írd. Ne váltsd át a mértékegységeket.`,
      '- Csak egy markdown kódblokkal válaszolj, amely a receptet tartalmazza, előtte és utána szöveg nélkül.',
      '',
      '## Az átalakítandó recept',
      '',
    ],
    translationPrompt: ({ from, to, recipe }) => [
      `A CookIt (főzős alkalmazás) egy receptjét fordítod. Forrásnyelv: ${from}. Célnyelv: ${to}.`,
      '',
      '## Szabályok',
      '',
      '- Pontosan tartsd meg a szerkezetet: a három részt, amelyeket egy `---` sor választ el, ugyanazokat a `###` csoportokat ugyanabban a sorrendben, és csoportonként ugyanannyi hozzávalót és lépést.',
      '- Fordítsd le a címet, a leírást, a csoportok nevét, a hozzávalókat, a lépéseket és az időzítők nevét (a `timer:` hivatkozás idézőjeles szövegét).',
      '- A `timer:` és `q:` hivatkozásokat hagyd változatlanul: ugyanaz a szintaxis, ugyanaz az időtartam (`timer:10m`); csak a szögletes zárójelben lévő szöveg és az időzítő neve fordítandó.',
      '- Ne váltsd át se a mértékegységeket, se a mennyiségeket (a 250 g 250 g marad); csak a mértékegység neve fordítandó.',
      '- Tartsd meg a bemutatás `kulcs: érték` sorait (adag, source, format) ugyanazokkal az értékekkel.',
      '- Csak egy markdown kódblokkal válaszolj, amely a lefordított receptet tartalmazza, előtte és utána szöveg nélkül.',
      '',
      '## Recept',
      '',
      recipe,
    ],
  },
};

/**
 * The import prompt, written in `locale` (the interface language), asking for a recipe in `lang`.
 * Units come from the catalog of the database; tags are the ones of the common list (the AI may
 * only choose among them; the "Validate tags" step still applies).
 */
export function importPrompt(options: {
  locale: Locale;
  lang: Locale;
  units?: readonly Unit[];
  tagCategories?: readonly TagCategory[];
}): string {
  const categories = options.tagCategories ?? [];
  const tags = tagLines(categories, options.locale);
  const example = promptExample(options.lang, tags.length ? exampleTags(categories) : []);
  const lines = TEXTS[options.locale].importPrompt({
    lang: LANGUAGE_NAMES[options.locale][options.lang],
    keys: { servings: META_KEYS.servings[options.lang][0] ?? 'servings', tags: 'tags' },
    units: unitList(options.units ?? DEFAULT_UNITS, options.lang),
    tags,
    example: fence(example),
  });
  return `${lines.join('\n')}\n`;
}

/**
 * The translation prompt, written in `locale`: the recipe (`markdown`, without `tags:` line)
 * from `from` to `to`, with the rules that keep the structure identical.
 */
export function translationPrompt(options: {
  locale: Locale;
  from: Locale;
  to: Locale;
  markdown: string;
}): string {
  const names = LANGUAGE_NAMES[options.locale];
  const lines = TEXTS[options.locale].translationPrompt({
    from: names[options.from],
    to: names[options.to],
    recipe: fence(options.markdown),
  });
  return `${lines.join('\n')}\n`;
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * The recipe in an AI's answer: the content of its longest code block (the answer may add a
 * sentence or a second block around it), or the whole text when there is no code block.
 */
export function extractMarkdownBlock(answer: string): string {
  const lines = answer.slice(0, MAX_RECIPE_MARKDOWN_LENGTH * 2).split(/\r\n|\n|\r/);
  let best: string | undefined;
  let open: { marks: string; start: number } | undefined;
  const keep = (end: number) => {
    if (!open) return;
    const block = lines.slice(open.start, end).join('\n');
    if (best === undefined || block.length > best.length) best = block;
  };
  lines.forEach((line, index) => {
    const marks = FENCE.exec(line)?.[1];
    if (!open) {
      if (marks) open = { marks, start: index + 1 };
      return;
    }
    // A closing fence: same character, at least as long, nothing after it.
    const closes =
      marks !== undefined &&
      marks[0] === open.marks[0] &&
      marks.length >= open.marks.length &&
      line.trim() === marks;
    if (closes) {
      keep(index);
      open = undefined;
    }
  });
  // An unclosed block (answer cut short) runs to the end.
  keep(lines.length);
  return `${(best ?? answer).trim()}\n`;
}
