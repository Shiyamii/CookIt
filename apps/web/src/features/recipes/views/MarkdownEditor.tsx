import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { EditorState, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  keymap,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { useEffect, useRef } from 'react';

/**
 * Markdown editor of a recipe (CodeMirror 6). No markdown language package: a small line
 * highlighter is enough for the format (part separators, titles and group headings, timers and
 * scalable quantities) and lines with errors are marked.
 */

const SEPARATOR = /^-{3,}[ \t]*$/;
const HEADING = /^ {0,3}#{1,3}(?=[ \t]|$)/;
const SPECIAL_LINK = /\[[^\]\n]*\]\((?:timer:[^)\n]*|q:)\)/gi;

const separatorLine = Decoration.line({ class: 'cm-cookit-separator' });
const headingLine = Decoration.line({ class: 'cm-cookit-heading' });
const errorLine = Decoration.line({ class: 'cm-cookit-error' });
const timerMark = Decoration.mark({ class: 'cm-cookit-timer' });
const quantityMark = Decoration.mark({ class: 'cm-cookit-quantity' });

function highlight(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to;) {
      const line = view.state.doc.lineAt(pos);
      if (SEPARATOR.test(line.text)) builder.add(line.from, line.from, separatorLine);
      else if (HEADING.test(line.text)) builder.add(line.from, line.from, headingLine);
      for (const match of line.text.matchAll(SPECIAL_LINK)) {
        const start = line.from + (match.index ?? 0);
        const isTimer = match[0].toLowerCase().includes('](timer:');
        builder.add(start, start + match[0].length, isTimer ? timerMark : quantityMark);
      }
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

const highlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = highlight(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) this.decorations = highlight(update.view);
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

/** Lines with an error (1-based), set from the diagnostics. */
const setErrorLines = StateEffect.define<number[]>();
const errorLines = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, transaction) {
    let next = decorations.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (!effect.is(setErrorLines)) continue;
      const builder = new RangeSetBuilder<Decoration>();
      const lines = [...new Set(effect.value)].sort((a, b) => a - b);
      for (const number of lines) {
        if (number < 1 || number > transaction.state.doc.lines) continue;
        const line = transaction.state.doc.line(number);
        builder.add(line.from, line.from, errorLine);
      }
      next = builder.finish();
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

// Colors come from the theme's CSS variables (light and dark).
const theme = EditorView.theme({
  '&': {
    fontSize: '0.9rem',
    border: '1px solid var(--input)',
    borderRadius: 'var(--radius)',
    backgroundColor: 'var(--background)',
    color: 'var(--foreground)',
  },
  '&.cm-focused': { outline: '2px solid var(--ring)' },
  '.cm-content': { fontFamily: 'var(--font-mono, ui-monospace, monospace)', padding: '0.75rem 0' },
  '.cm-line': { padding: '0 0.75rem' },
  '.cm-cursor': { borderLeftColor: 'var(--foreground)' },
  '.cm-cookit-separator': { color: 'var(--primary)', fontWeight: '700' },
  '.cm-cookit-heading': { color: 'var(--primary)', fontWeight: '600' },
  '.cm-cookit-timer': {
    backgroundColor: 'var(--secondary)',
    color: 'var(--secondary-foreground)',
    borderRadius: '4px',
  },
  '.cm-cookit-quantity': { textDecoration: 'underline', textDecorationColor: 'var(--primary)' },
  '.cm-cookit-error': {
    backgroundColor: 'color-mix(in oklab, var(--destructive) 15%, transparent)',
  },
});

export function MarkdownEditor({
  value,
  onChange,
  errorLines: lines,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  /** 1-based lines to mark as wrong. */
  errorLines: number[];
  label: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Created once; the text then lives in CodeMirror and is reported through onChange.
  useEffect(() => {
    if (!host.current) return;
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ 'aria-label': label, spellcheck: 'true' }),
          highlighter,
          errorLines,
          theme,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
    };
    // The initial text only: later changes come from the editor itself (or the effect below).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A value set from outside (switching editors, restoring a draft) replaces the text.
  useEffect(() => {
    const editor = view.current;
    if (!editor || editor.state.doc.toString() === value) return;
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
  }, [value]);

  useEffect(() => {
    view.current?.dispatch({ effects: setErrorLines.of(lines) });
  }, [lines]);

  return <div ref={host} data-testid="markdown-editor" className="min-h-80" />;
}
