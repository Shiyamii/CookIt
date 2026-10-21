import type { Nodes, RootContent } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { Fragment, useMemo, type ReactNode } from 'react';

/**
 * Untrusted markdown (recipe descriptions and steps) rendered as React elements from its syntax
 * tree: no HTML string is ever produced, raw HTML in the text stays text, images are shown as
 * their alt text, and links only keep http(s) and mailto targets (plan §7).
 */

const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);
/** A hostile text can nest deeply (`>>>>>…`): beyond this depth, the rest is plain text. */
const MAX_DEPTH = 32;
/**
 * Emphasis parsing is quadratic on hostile runs (`*a_` × 6000: 3 s for one text). Real
 * descriptions and steps stay far below these limits; beyond them the text is shown as written.
 */
const MAX_LENGTH = 5000;
const MAX_EMPHASIS_MARKERS = 200;

function tooCostly(text: string): boolean {
  if (text.length > MAX_LENGTH) return true;
  let markers = 0;
  for (const char of text) if (char === '*' || char === '_') markers += 1;
  return markers > MAX_EMPHASIS_MARKERS;
}

function safeHref(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return SAFE_PROTOCOLS.has(parsed.protocol) ? parsed.href : undefined;
  } catch {
    // Relative URLs mean nothing in a recipe shown at several addresses.
    return undefined;
  }
}

/** The text of a subtree, without recursion (deeply nested input). */
function plain(root: Nodes): string {
  let text = '';
  const stack: Nodes[] = [root];
  while (stack.length) {
    const node = stack.pop();
    if (!node) break;
    if ('value' in node && typeof node.value === 'string') text += node.value;
    else if (node.type === 'image') text += node.alt ?? '';
    else if ('children' in node) {
      for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i] as Nodes);
    }
  }
  return text;
}

function render(nodes: RootContent[], depth: number): ReactNode {
  return nodes.map((node, index) => <Fragment key={index}>{renderNode(node, depth)}</Fragment>);
}

function renderNode(node: RootContent, depth: number): ReactNode {
  if (depth > MAX_DEPTH) return plain(node);
  const children = () =>
    'children' in node ? render(node.children as RootContent[], depth + 1) : null;
  switch (node.type) {
    case 'text':
      return node.value;
    case 'paragraph':
      return <p>{children()}</p>;
    case 'emphasis':
      return <em>{children()}</em>;
    case 'strong':
      return <strong>{children()}</strong>;
    case 'delete':
      return <del>{children()}</del>;
    case 'inlineCode':
      return <code className="rounded bg-muted px-1 font-mono text-[0.9em]">{node.value}</code>;
    case 'code':
      return (
        <pre className="overflow-x-auto rounded bg-muted p-2 font-mono text-sm">{node.value}</pre>
      );
    case 'break':
      return <br />;
    case 'blockquote':
      return (
        <blockquote className="border-l-2 pl-3 text-muted-foreground">{children()}</blockquote>
      );
    case 'list':
      return node.ordered ? (
        <ol className="list-decimal pl-5">{children()}</ol>
      ) : (
        <ul className="list-disc pl-5">{children()}</ul>
      );
    case 'listItem':
      return <li>{children()}</li>;
    case 'heading':
      return <p className="font-semibold">{children()}</p>;
    case 'thematicBreak':
      return <hr className="my-2" />;
    case 'link': {
      const href = safeHref(node.url);
      if (!href) return children();
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="text-primary underline underline-offset-2"
        >
          {children()}
        </a>
      );
    }
    // Raw HTML is text; images and references show their text only.
    default:
      return plain(node);
  }
}

export function Markdown({ text, inline = false }: { text: string; inline?: boolean }) {
  const tree = useMemo(() => (tooCostly(text) ? undefined : fromMarkdown(text)), [text]);
  if (!tree) {
    return inline ? <>{text}</> : <p className="whitespace-pre-wrap">{text}</p>;
  }
  // Inline text (a piece of a step): a single paragraph is unwrapped.
  const [first] = tree.children;
  if (inline && tree.children.length === 1 && first?.type === 'paragraph') {
    // Markdown drops the spaces around a paragraph; between a piece of text and a timer or a
    // quantity of the same step, they matter.
    const before = /^\s/.test(text) ? ' ' : '';
    const after = /\s$/.test(text) ? ' ' : '';
    return (
      <>
        {before}
        {render(first.children, 1)}
        {after}
      </>
    );
  }
  return <div className="grid gap-2">{render(tree.children, 0)}</div>;
}
