/**
 * Parser diagnostics carry a code and parameters, not a message: the UI translates them.
 * Errors reject the document; warnings are shown but the recipe can still be saved.
 */
export type DiagnosticSeverity = 'error' | 'warning';

export type DiagnosticCode =
  /** The document exceeds MAX_RECIPE_MARKDOWN_LENGTH. Params: `max`. */
  | 'document_too_large'
  /** Fewer than 3 parts. Params: `found` (number of parts). */
  | 'missing_separator'
  /** More than 3 parts. Params: `found`. Line: the first extra separator. */
  | 'too_many_parts'
  /** The document starts with a dash line, like a YAML frontmatter, which the format does not use. */
  | 'frontmatter_not_supported'
  /** A dash-only line without a blank line before or after, or indented: not a separator (in standard markdown it underlines a heading or is a rule). */
  | 'ambiguous_separator'
  /** Too many diagnostics of one kind: the rest are counted, not listed. Params: `code`, `omitted`. */
  | 'diagnostics_truncated'
  /** A code block (``` or ~~~) is never closed: separators after it are ignored. */
  | 'unclosed_code_block'
  /** Part 1 has no `# Title` line. */
  | 'missing_title'
  /** Text before the `# Title` line: kept at the start of the description. */
  | 'text_before_title'
  /** No `portions:` / `servings:` line. */
  | 'missing_servings'
  /** Servings is not a whole number between 1 and 1000. Params: `value`. */
  | 'invalid_servings'
  /** `format:` is not a whole number. Params: `value`. */
  | 'invalid_format'
  /** `format:` is newer than this version of the app. Params: `value`, `max`. */
  | 'unsupported_format'
  /** The same key appears twice in part 1. Params: `key`. */
  | 'duplicate_meta_key'
  /** Part 2 has no ingredient (allowed: a recipe can be completed later). */
  | 'empty_ingredients'
  /** Part 3 has no step (allowed). */
  | 'empty_steps'
  /** A `### Group` heading with nothing under it. Params: `name`. */
  | 'empty_group'
  /** A `timer:` link with an invalid duration (kept as text). Params: `value` (the link). */
  | 'invalid_timer'
  /** A `q:` link whose text has no number (kept as text). Params: `value` (the link). */
  | 'invalid_quantity'
  /** A step over MAX_INLINE_LENGTH: kept, but its timers and quantities are not read. Params: `value` (its start). */
  | 'step_too_long'
  // Translation structure (warnings): a cooking session can only switch between identical structures.
  /** Params: `expected`, `found`. */
  | 'translation_servings'
  /** Params: `part` (`ingredients` | `steps`), `expected`, `found`. */
  | 'translation_group_count'
  /** Ingredients or steps in a group. Params: `part`, `group` (1-based), `expected`, `found`. */
  | 'translation_item_count'
  /** Timer durations of a step (seconds, in order). Params: `step` (1-based), `expected`, `found`. */
  | 'translation_timers';

export type Diagnostic = {
  code: DiagnosticCode;
  severity: DiagnosticSeverity;
  /** 1-based line in the source document. */
  line?: number;
  params?: Record<string, string | number>;
};

/** A hostile document must not produce an unbounded list: beyond this, a code is only counted. */
export const MAX_DIAGNOSTICS_PER_CODE = 50;
const MAX_PARAM_LENGTH = 80;

/** Collects diagnostics with a cap per code and truncated text parameters. */
export function createDiagnostics() {
  const list: Diagnostic[] = [];
  const counts = new Map<DiagnosticCode, number>();

  function add(severity: DiagnosticSeverity, diagnostic: Omit<Diagnostic, 'severity'>) {
    const count = (counts.get(diagnostic.code) ?? 0) + 1;
    counts.set(diagnostic.code, count);
    if (count > MAX_DIAGNOSTICS_PER_CODE) return;
    const params = diagnostic.params && truncateParams(diagnostic.params);
    list.push({ ...diagnostic, severity, ...(params && { params }) });
  }

  return {
    error: (diagnostic: Omit<Diagnostic, 'severity'>) => add('error', diagnostic),
    warning: (diagnostic: Omit<Diagnostic, 'severity'>) => add('warning', diagnostic),
    hasErrors: () => list.some((d) => d.severity === 'error'),
    /** The collected diagnostics, plus one `diagnostics_truncated` per capped code. */
    result(): Diagnostic[] {
      const truncated: Diagnostic[] = [...counts]
        .filter(([, count]) => count > MAX_DIAGNOSTICS_PER_CODE)
        .map(([code, count]) => ({
          code: 'diagnostics_truncated',
          severity: 'warning',
          params: { code, omitted: count - MAX_DIAGNOSTICS_PER_CODE },
        }));
      return [...list, ...truncated];
    },
  };
}

function truncateParams(params: Record<string, string | number>) {
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => [
      key,
      typeof value === 'string' && value.length > MAX_PARAM_LENGTH
        ? `${value.slice(0, MAX_PARAM_LENGTH)}…`
        : value,
    ]),
  );
}
